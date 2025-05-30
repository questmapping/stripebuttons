import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getProductById, Product } from '@/lib/products';

/**
 * @swagger
 * /api/log-cancellation:
 *   post:
 *     summary: Logs a cancelled Stripe Checkout session.
 *     description: >
 *       Records an event in the database when a user cancels a Stripe Checkout session.
 *       This is typically called from the checkout page when payment_cancelled=true is detected.
 *       Requires ADMIN_API_SECRET for authorization via X-Admin-API-Secret header.
 *       It uses NEXT_PUBLIC_ADMIN_API_SECRET for client-side initiated calls for simplicity in this example.
 *     tags:
 *       - Admin Actions
 *     security:
 *       - apiKeyAuth: [] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - productId
 *               - stripeSessionId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the user who cancelled.
 *               productId:
 *                 type: string
 *                 description: The ID of the product for which the payment was cancelled.
 *               stripeSessionId:
 *                 type: string
 *                 description: The Stripe Checkout Session ID that was cancelled.
 *     responses:
 *       200:
 *         description: Cancellation event logged successfully.
 *       400:
 *         description: Bad Request - Missing required fields or invalid product.
 *       401:
 *         description: Unauthorized - Invalid or missing X-Admin-API-Secret header.
 *       500:
 *         description: Internal Server Error.
 */
export async function POST(req: NextRequest) {
  // For client-side initiated calls like this, we'll check against NEXT_PUBLIC_ADMIN_API_SECRET
  // In a production app with more robust auth, this might involve session tokens or more secure API key handling.
  const expectedSecret = process.env.NEXT_PUBLIC_ADMIN_API_SECRET;
  const providedSecret = req.headers.get('X-Admin-API-Secret');

  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.warn(`Log-cancellation: Unauthorized attempt. Provided: ${providedSecret}, Expected (public): ${expectedSecret}`);
    return NextResponse.json({ error: 'Unauthorized. Invalid or missing API secret.' }, { status: 401 });
  }

  try {
    const { email, productId, stripeSessionId } = await req.json();

    if (!email || !productId || !stripeSessionId) {
      return NextResponse.json({ error: 'Missing required fields: email, productId, stripeSessionId' }, { status: 400 });
    }

    const product: Product | undefined = getProductById(productId);
    if (!product) {
      return NextResponse.json({ error: 'Invalid Product ID' }, { status: 400 });
    }

    // Record the cancellation event
    // Note: Points awarded is 0 for cancellations.
    const queryText = `
      INSERT INTO purchase_events 
        (email, product_id, points_awarded, stripe_session_id, status, timestamp, details)
      VALUES 
        ($1, $2, $3, $4, $5, NOW(), $6) 
    `; // Corrected event_timestamp to timestamp
    const values = [
      email,                          // $1
      productId,                      // $2
      0,                              // $3 (points_awarded)
      stripeSessionId,                // $4
      'cancelled_by_user',            // $5 (status)
      {                               // $6 (details - JSONB)
        product_name: product.name,
        price_paid: product.price,      // Add price_paid here
        cancelled_at: new Date().toISOString(), 
        reason: 'User clicked cancel on Stripe page' 
      }
    ];
    await sql(queryText, values);

    console.log(`Cancellation logged for session: ${stripeSessionId}, email: ${email}`);
    return NextResponse.json({ message: 'Cancellation event logged successfully' });

  } catch (error: any) {
    console.error('Error logging cancellation event:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
