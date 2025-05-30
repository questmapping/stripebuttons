import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || 'your-admin-api-secret';

/**
 * @swagger
 * /api/admin/user/events:
 *   get:
 *     summary: Retrieves all purchase events for a specific user.
 *     description: >
 *       Fetches all purchase events associated with a user, identified by their email address, from the `purchase_events` table.
 *       Events are ordered by timestamp in descending order.
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
 *         description: The email address of the user whose purchase events are to be fetched.
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
 *         description: A list of purchase events for the specified user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PurchaseEvent' # Assuming you have a schema definition elsewhere
 *       400:
 *         description: Bad Request - Email query parameter is required.
 *       401:
 *         description: Unauthorized - Missing or invalid secret.
 *       500:
 *         description: Failed to fetch user purchase events due to a server error.
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
    const result = await sql("SELECT * FROM purchase_events WHERE email = $1 ORDER BY timestamp DESC;", [email]);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error(`Failed to fetch purchase events for user ${email}:`, error);
    return NextResponse.json(
      { 
        message: `Failed to fetch purchase events for user ${email}.`, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
}
