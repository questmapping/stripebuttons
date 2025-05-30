import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Basic protection - ensure this is more robust in a real app
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || 'your-admin-api-secret';

/**
 * @swagger
 * /api/admin/events/all:
 *   get:
 *     summary: Retrieves all purchase events.
 *     description: >
 *       Fetches all records from the `purchase_events` table, ordered by timestamp in descending order.
 *       Requires admin authentication via a secret key passed in the 'X-Admin-Secret' header or 'secret' query parameter.
 *       In production, this endpoint is protected. In development, protection is bypassed if no secret is provided.
 *     tags:
 *       - Admin Events
 *     parameters:
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
 *         description: A list of all purchase events.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PurchaseEvent' # Assuming you have a schema definition elsewhere or will define one
 *       401:
 *         description: Unauthorized - Missing or invalid secret.
 *       500:
 *         description: Failed to fetch purchase events due to a server error.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Admin-Secret') || req.nextUrl.searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret.' }, { status: 401 });
  }
  if (process.env.NODE_ENV !== 'development' && secret !== ADMIN_SECRET) {
     return NextResponse.json({ error: 'Unauthorized: Missing or invalid secret for non-dev environment.' }, { status: 401 });
  }

  try {
    const result = await sql("SELECT * FROM purchase_events ORDER BY timestamp DESC;");
    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error('Failed to fetch all purchase events:', error);
    return NextResponse.json(
      { 
        message: 'Failed to fetch purchase events.', 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
}
