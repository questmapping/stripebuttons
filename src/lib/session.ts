// src/lib/session.ts
import type { SessionOptions } from 'iron-session';

export interface SessionData {
  isAdmin?: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'myapp_session', // You can choose any name
  // secure: true should be used in production (HTTPS)
  // but for development on localhost (HTTP) it should be false
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    sameSite: 'lax', // CSRF protection
  },
};

