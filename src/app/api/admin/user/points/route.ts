import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || 'your-admin-api-secret';

/**
 * @swagger
 * /api/admin/user/points:
 *   get:
 *     summary: Retrieves the total points for a specific user.
 *     description: >
 *       Fetches the total points accumulated by a user, identified by their email address, from the `user_points` table.
 *       Requires admin authentication via a secret key passed in the 'X-Admin-Secret' header or 'secret' query parameter.
 *       The user's email must be provided as a query parameter.
 *     tags:
 *       - Admin User Data
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: The email address of the user whose points are to be fetched.
 *       - in: header
 *         name: X-Admin-Secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication.
 *       - in: query
 *         name: secret
 *         schema:
 *           type: string
 *         description: Secret key for admin authentication (alternative to header).
 *     responses:
 *       200:
 *         description: The user's total points or a message if the user is not found/has no points.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                   description: The email of the user queried.
 *                 total_points:
 *                   type: integer
 *                   description: The total points of the user. Can be 0.
 *                 message:
 *                   type: string
 *                   description: Optional message, e.g., if user not found.
 *                   example: User not found or has no points record.
 *       400:
 *         description: Bad Request - Email query parameter is required.
 *       401:
 *         description: Unauthorized - Missing or invalid secret.
 *       500:
 *         description: Failed to fetch user points due to a server error.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Admin-Secret') || req.nextUrl.searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret.' }, { status: 401 });
  }
  if (process.env.NODE_ENV !== 'development' && secret !== ADMIN_SECRET) {
     return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret for non-dev environment.' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email query parameter is required.' }, { status: 400 });
  }

  try {
    const result = await sql("SELECT total_points FROM user_points WHERE email = $1;", [email]);
    if (result.rows.length === 0) {
      return NextResponse.json({ email: email, total_points: 0, message: 'User not found or has no points record.' });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error(`Failed to fetch points for user ${email}:`, error);
    return NextResponse.json(
      { 
        message: `Failed to fetch points for user ${email}.`, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
}
