import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from './lib/session'; // Relative path from src

// --- Configuration for Allowed Origins ---
// Attempt to get allowed origins from an environment variable, split by comma.
// Example .env.local: ALLOWED_ORIGINS=http://localhost:3001,https://your-production-frontend.com
const envAllowedOrigins = process.env.ALLOWED_ORIGINS?.split(',');

const defaultAllowedOrigins = [
  'http://localhost:3000', // Default for local Next.js dev (if API called from same origin but different port, or for tools)
  // Add your production frontend URL here if known, or load from env
];

const allowedOrigins = envAllowedOrigins && envAllowedOrigins.length > 0 
  ? [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])] // Combine and deduplicate
  : defaultAllowedOrigins;

console.log('CORS Middleware: Allowed Origins:', allowedOrigins);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let initialResponse = NextResponse.next(); // Response object for iron-session to potentially set cookies on

  // --- Admin Authentication Logic ---
  if (pathname.startsWith('/admin')) {
    const isAdminAuthEnabled = process.env.ADMIN_AUTH_ENABLED === 'true';
    if (isAdminAuthEnabled) {
      try {
        // `getIronSession` now uses `request` and the `response` object declared above.
        // Any cookies set by iron-session (e.g., session refresh) will be added to `response.headers`.
        const session = await getIronSession<SessionData>(request, initialResponse, sessionOptions);

        if (!session.isAdmin) {
          const loginUrl = new URL('/login', request.url);
          if (pathname !== '/login') {
            loginUrl.searchParams.set('redirect_to', pathname);
          }
          console.log(`AdminAuth: Middleware: User not authenticated or not admin for ${pathname}. Redirecting to login.`);
          
          // Create a new response for the redirect.
          const redirectResponse = NextResponse.redirect(loginUrl);
          
          // Copy any cookies set by iron-session on the `response` object to the `redirectResponse`.
          // This ensures session changes (like refresh) are persisted even when redirecting.
          initialResponse.cookies.getAll().forEach((cookie) => {
            const { name, value, ...options } = cookie;
            redirectResponse.cookies.set(name, value, options);
          });
          return redirectResponse;
        }
        console.log(`AdminAuth: Middleware: Access granted for authenticated admin to ${pathname}.`);
        // If admin is authenticated, the `response` object (which may contain new/updated session cookies)
        // will proceed to the rest of the middleware logic (e.g., CORS handling).
      } catch (error) {
        console.error('AdminAuth: Middleware session error:', error);
        const loginUrl = new URL('/login', request.url);
        if (pathname !== '/login') {
            loginUrl.searchParams.set('redirect_to', pathname);
        }
        return NextResponse.redirect(loginUrl);
      }
    } else {
      console.log(`AdminAuth: Middleware: Admin authentication is disabled. Access granted to ${pathname}.`);
    }
  }

  // --- CORS Logic (adapted from original) ---
  const requestHeaders = new Headers(request.headers);
  const origin = requestHeaders.get('origin');

  // allowedOrigins should be defined globally in this file, above this function.

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Copy cookies from initialResponse (potentially modified by iron-session) to the current response
  initialResponse.cookies.getAll().forEach(cookie => {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  });

  if (origin && allowedOrigins.includes(origin)) {
    console.log(`CORS Middleware: Origin '${origin}' is allowed. Applying CORS headers.`);
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (!origin && process.env.NODE_ENV !== 'production') {
    console.log('CORS Middleware: No origin, allowing in non-production with wildcard.');
    response.headers.set('Access-Control-Allow-Origin', '*'); 
  }

  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Secret, Authorization'
  );
  response.headers.set('Access-Control-Max-Age', '86400');

  if (request.method === 'OPTIONS') {
    console.log('CORS Middleware: Handling OPTIONS preflight request.');
    let preflightResponse = new NextResponse(null, { status: 204 });

    // Copy cookies from initialResponse to preflightResponse (for consistency)
    initialResponse.cookies.getAll().forEach(cookie => {
      const { name, value, ...options } = cookie;
      preflightResponse.cookies.set(name, value, options);
    });

    if (origin && allowedOrigins.includes(origin)) {
      console.log(`CORS Middleware: OPTIONS preflight for origin '${origin}' is allowed.`);
      preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
    } else if (!origin && process.env.NODE_ENV !== 'production') {
      console.log('CORS Middleware: OPTIONS preflight for no-origin in non-production, allowing wildcard.');
      preflightResponse.headers.set('Access-Control-Allow-Origin', '*');
    } else {
      console.log(`CORS Middleware: OPTIONS preflight for origin '${origin || 'none'}' not explicitly allowed. Returning basic 204.`);
      return new NextResponse(null, { status: 204 });
    }
    
    preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    preflightResponse.headers.set(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Secret, Authorization'
    );
    preflightResponse.headers.set('Access-Control-Max-Age', '86400');
    return preflightResponse;
  }

  return response;
}

// Specify which paths the middleware should apply to
export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
  ],
};
