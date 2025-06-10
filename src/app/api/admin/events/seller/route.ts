import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * @swagger
 * /api/admin/events/seller:
 *   get:
 *     summary: Retrieves successful purchase events for a specific seller.
 *     description: >
 *       Fetches all purchase events with a status of 'PAYMENT_SUCCESS' for a given seller ID.
 *       It can optionally be filtered by month and year. It also returns the total sales volume
 *       for the filtered period. This is a protected endpoint and requires an admin secret.
 *     tags:
 *       - Admin
 *     parameters:
 *       - in: header
 *         name: X-Admin-Secret
 *         required: true
 *         schema:
 *           type: string
 *         description: The secret key to authenticate admin requests.
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the seller to retrieve events for.
 *       - in: query
 *         name: monthYear
 *         required: false
 *         schema:
 *           type: string
 *           format: 'YYYY-MM'
 *         description: Optional filter to get events for a specific month (e.g., '2025-06').
 *     responses:
 *       200:
 *         description: Successfully retrieved seller events and total volume.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                 totalVolume:
 *                   type: number
 *                   description: The sum of 'price_paid' for all filtered events.
 *       400:
 *         description: Bad Request - Missing required parameters or invalid format.
 *       401:
 *         description: Unauthorized - Admin secret is missing or incorrect.
 *       500:
 *         description: Internal Server Error.
 */

const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'your-admin-api-secret-key';

export async function GET(req: NextRequest) {
  const providedSecret = req.headers.get('X-Admin-Secret');
  if (providedSecret !== ADMIN_API_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sellerId = searchParams.get('sellerId');
  const monthYear = searchParams.get('monthYear'); // Expected format: YYYY-MM

  if (!sellerId) {
    return NextResponse.json({ message: 'Seller ID is required' }, { status: 400 });
  }

  let year: number | null = null;
  let month: number | null = null;

  if (monthYear && monthYear.trim() !== '') {
    const parts = monthYear.split('-');
    if (parts.length === 2 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]))) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
    } else {
      return NextResponse.json({ message: 'Invalid monthYear format. Use YYYY-MM.' }, { status: 400 });
    }
  }

  try {
    const params: any[] = [sellerId];
    let timeFilter = '';

    if (year && month) {
      timeFilter = ` AND EXTRACT(YEAR FROM timestamp) = $${params.length + 1} AND EXTRACT(MONTH FROM timestamp) = $${params.length + 2}`;
      params.push(year, month);
    }

    const eventsQuery = `
      SELECT * FROM purchase_events 
      WHERE seller_id = $1 AND status = 'PAYMENT_SUCCESS'${timeFilter}
      ORDER BY timestamp DESC;`;

    const totalQuery = `
      SELECT SUM((details->>'price_paid')::numeric) as total_volume 
      FROM purchase_events 
      WHERE seller_id = $1 AND status = 'PAYMENT_SUCCESS'${timeFilter};`;

    const eventsResult = await sql(eventsQuery, params);
    const totalResult = await sql(totalQuery, params);

    const events = eventsResult.rows;
    const totalVolume = totalResult.rows[0]?.total_volume || 0;

    return NextResponse.json({ events, totalVolume });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to fetch seller events.', error: errorMessage }, { status: 500 });
  }
}
