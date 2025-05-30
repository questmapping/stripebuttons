// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session'; // Assuming path alias
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  if (process.env.ADMIN_AUTH_ENABLED !== 'true') {
    return NextResponse.json({ message: 'Admin authentication is disabled.' }, { status: 403 });
  }

  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    session.destroy(); // Clears the session
    console.log('Logout successful, session destroyed.');
    // It's good practice to send a response indicating success,
    // the client can then decide to redirect.
    return NextResponse.json({ message: 'Logout successful' }, { status: 200 });
  } catch (error) {
    console.error('Logout API error:', error);
    const message = error instanceof Error ? error.message : 'An internal server error occurred during logout.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
