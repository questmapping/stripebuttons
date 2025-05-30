import { NextRequest, NextResponse } from 'next/server';
import { initializeDbSchema } from '@/lib/db';

// Basic protection: Check for a simple secret in the header or query param.
// In a real app, use proper authentication/authorization for admin actions.
const ADMIN_SECRET = process.env.ADMIN_INIT_DB_SECRET || 'your-very-secret-key';

/**
 * @swagger
 * /api/admin/init-db:
 *   post:
 *     summary: Initializes the database schema.
 *     description: >
 *       Connects to the database and attempts to create the necessary tables (`purchase_events`, `user_points`)
 *       if they do not already exist. This endpoint is intended for initial setup or schema verification.
 *       Requires admin authentication via a secret key passed in the 'X-Admin-Secret' header or 'secret' query parameter.
 *       In production, this endpoint is protected. In development, protection is less strict if no secret is provided.
 *     tags:
 *       - Admin Database
 *     parameters:
 *       - in: header
 *         name: X-Admin-Secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication (using ADMIN_INIT_DB_SECRET).
 *       - in: query
 *         name: secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication (alternative to header).
 *     responses:
 *       200:
 *         description: Database schema initialized successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Database schema initialized successfully.
 *       401:
 *         description: Unauthorized - Missing or invalid secret.
 *       500:
 *         description: Failed to initialize database schema due to a server error.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Admin-Secret') || req.nextUrl.searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret.' }, { status: 401 });
  }
  // In development, you might allow it without a secret for ease of use, but be cautious.
  if (process.env.NODE_ENV !== 'development' && secret !== ADMIN_SECRET) {
     return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret for non-dev environment.' }, { status: 401 });
  }

  try {
    console.log('Attempting to initialize database schema...');
    await initializeDbSchema();
    console.log('Database schema initialization process completed.');
    return NextResponse.json({ message: 'Database schema initialized successfully.' });
  } catch (error: any) {
    console.error('Failed to initialize DB schema via API:', error);
    return NextResponse.json(
      { 
        message: 'Failed to initialize database schema.', 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
}

// You might also want a GET handler for simpler invocation from a browser during dev,
// but POST is generally safer for actions that change state.
/**
 * @swagger
 * /api/admin/init-db:
 *   get:
 *     summary: Checks database initialization status or allows GET-based initialization in development.
 *     description: >
 *       (Development Only) Provides a GET endpoint for database initialization, primarily for convenience.
 *       In production, this GET endpoint is protected and might only return a status message rather than perform initialization.
 *       The current implementation for GET is partial and primarily intended for development scenarios.
 *       Requires admin authentication similar to the POST request.
 *     tags:
 *       - Admin Database
 *     parameters:
 *       - in: header
 *         name: X-Admin-Secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication (using ADMIN_INIT_DB_SECRET).
 *       - in: query
 *         name: secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication (alternative to header).
 *     responses:
 *       200:
 *         description: Status message or confirmation (behavior depends on environment and implementation completeness).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: DB Initialization endpoint (GET). Further action depends on environment.
 *       401:
 *         description: Unauthorized - Missing or invalid secret.
 *       500:
 *         description: Server error if an attempt to initialize via GET fails.
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get('X-Admin-Secret') || req.nextUrl.searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && secret !== ADMIN_SECRET) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret.' }, { status: 401 });
    }
    if (process.env.NODE_ENV !== 'development' && secret !== ADMIN_SECRET) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret for non-dev environment.' }, { status: 401 });
    }

    // For GET, perhaps just return a status or a confirmation message that it *can* be initialized.
    // Or, allow GET for initialization in dev for convenience.
    if (process.env.NODE_ENV === 'development') {
        try {
            console.log('Attempting to initialize database schema via GET (dev only)...');
            await initializeDbSchema();
            console.log('Database schema initialization process completed (via GET).');
            return NextResponse.json({ message: 'Database schema initialized successfully (via GET - dev only).' });
        } catch (error: any) {
            console.error('Failed to initialize DB schema via API (GET - dev only):', error);
            return NextResponse.json(
              { 
                message: 'Failed to initialize database schema (via GET - dev only).', 
                error: error.message,
                stack: error.stack
              }, 
              { status: 500 }
            );
        }
    }

    return NextResponse.json({ message: 'Use POST to initialize DB. GET is allowed in dev only for initialization.' }, { status: 405 });
}
