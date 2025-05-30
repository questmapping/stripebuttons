// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session'; // Assuming path alias
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  if (process.env.ADMIN_AUTH_ENABLED !== 'true') {
    // If auth is disabled, perhaps we should allow access or handle differently?
    // For now, returning 403 to indicate it's explicitly off.
    return NextResponse.json({ message: 'Admin authentication is disabled.' }, { status: 403 });
  }

  try {
    const { username, password } = await req.json();

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      console.error('ADMIN_USERNAME or ADMIN_PASSWORD not set in .env file.');
      return NextResponse.json({ message: 'Server configuration error. Admin credentials not set.' }, { status: 500 });
    }

    if (username === adminUsername && password === adminPassword) {
      const cookieStore = await cookies();
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
      // Note: iron-session's types might expect session.user to be defined before assigning properties
      // or to assign the whole object.
      session.isAdmin = true;
      await session.save();
      console.log('Login successful, session saved for user:', username);
      return NextResponse.json({ message: 'Login successful' }, { status: 200 });
    } else {
      console.log('Login failed for user:', username);
      return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
    }
  } catch (error) {
    console.error('Login API error:', error);
    const message = error instanceof Error ? error.message : 'An internal server error occurred.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
