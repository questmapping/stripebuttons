import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db';
import { getProductById, products } from '@/lib/products'; // Assuming your db utility is in src/lib/db.ts
import { Buffer } from 'buffer'; // Required for reading the raw body

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil', // Match version in checkout_sessions
  typescript: true,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Helper function to record events
async function recordPurchaseEvent(data: {
  email: string;
  productId?: string;
  seller_id?: number;
  stripeSessionId: string;
  status: string;
  pointsAwarded?: number;
  details?: object;
}) {
  try {
    await sql(
      `INSERT INTO purchase_events (email, product_id, seller_id, stripe_session_id, status, points_awarded, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (stripe_session_id) DO UPDATE SET status = EXCLUDED.status, details = EXCLUDED.details, product_id = EXCLUDED.product_id, seller_id = EXCLUDED.seller_id, points_awarded = EXCLUDED.points_awarded;`,
      [
        data.email,
        data.productId,
        data.seller_id,
        data.stripeSessionId,
        data.status,
        data.pointsAwarded,
        data.details ? JSON.stringify(data.details) : null,
      ]
    );
  } catch (dbError) {
    console.error('Failed to record purchase event:', dbError, 'Data:', data);
    // Optionally, throw or handle more gracefully (e.g., retry logic, dead-letter queue)
  }
}

// Helper function to update user points
async function updateUserPoints(email: string, pointsToAdd: number, stripeSessionId: string) {
  try {
    await sql(
      `INSERT INTO user_points (email, total_points, last_updated)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE
       SET total_points = user_points.total_points + $2, last_updated = CURRENT_TIMESTAMP;`,
      [email, pointsToAdd]
    );
    console.log(`Successfully awarded ${pointsToAdd} points to ${email} for session ${stripeSessionId}`);
  } catch (dbError) {
    console.error(`Failed to update points for ${email} (session ${stripeSessionId}):`, dbError);
    // If you need to log this failure to purchase_events, it would require a different approach
    // or re-introducing a call to recordPurchaseEvent with a different status and ensuring it doesn't overwrite productId.
    // For now, per user request, keeping it simple and only updating user_points.
  }
}

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     summary: Handles incoming webhook events from Stripe.
 *     description: >
 *       This endpoint receives and processes webhook events sent by Stripe.
 *       It verifies the webhook signature to ensure the request originates from Stripe.
 *       Currently, it handles 'checkout.session.completed' to record successful purchases and award points,
 *       and 'payment_intent.payment_failed' to log failed payment attempts.
 *       The raw request body is required for signature verification.
 *     tags:
 *       - Stripe Webhooks
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: The Stripe signature header used for verifying the webhook event.
 *     requestBody:
 *       required: true
 *       description: The raw request body from Stripe containing the event payload.
 *       content:
 *         application/json: # Stripe sends JSON, but we need raw body for verification
 *           schema:
 *             type: object # Actual structure depends on the Stripe event type
 *     responses:
 *       200:
 *         description: Webhook event received and processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event processed.
 *       400:
 *         description: Bad Request - Missing Stripe signature or webhook signature verification failed.
 *       500:
 *         description: Internal Server Error - Webhook secret not configured or an unexpected error occurred during event processing.
 */
export async function POST(req: NextRequest) {
  const headersObject = Object.fromEntries(req.headers.entries());
  console.log('Stripe webhook POST request received. Headers:', JSON.stringify(headersObject));

  const buf = await req.text();
  const sig = req.headers.get('stripe-signature');
  console.log('Stripe webhook raw body length:', buf.length, 'Signature:', sig); // New log

  if (!sig) {
    console.warn('Stripe webhook error: Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }
  if (!webhookSecret) {
    console.error('Stripe webhook error: STRIPE_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Stripe webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);

        const email = session.metadata?.email || session.customer_details?.email;
        const productId = session.metadata?.productId;
        const sellerId = parseInt(session.metadata?.sellerId || '0', 10);

        if (!email || !productId) {
          console.error('Checkout session completed but missing email or productId in metadata.', session.id);
          await recordPurchaseEvent({ 
            email: email || 'unknown@example.com', 
            stripeSessionId: session.id, 
            status: 'ERROR_MISSING_METADATA',
            productId: productId,
            seller_id: sellerId,
            details: { error: 'Email or productId not found in session metadata' }
          });
          return NextResponse.json({ received: true, error: 'Email or productId missing in session data' });
        }
        
        const product = getProductById(productId);

        if (!product) {
          console.error(`Product with ID ${productId} not found for session ${session.id}.`);
          await recordPurchaseEvent({
            email,
            stripeSessionId: session.id,
            status: 'ERROR_PRODUCT_NOT_FOUND',
            productId: productId,
            seller_id: sellerId,
            details: { error: `Product ID ${productId} not found.` }
          });
          return NextResponse.json({ received: true, error: `Product ID ${productId} not found.` });
        }

        const pointsToAward = product.points;

        // Record successful payment
        await recordPurchaseEvent({
          email,
          productId,
          seller_id: sellerId,
          stripeSessionId: session.id,
          status: 'PAYMENT_SUCCESS',
          pointsAwarded: pointsToAward,
          details: { 
            product_name: product.name,
            price_paid: product.price, // Consider session.amount_total / 100 for cents consistency
            payment_intent: session.payment_intent,
            // client_reference_id: session.client_reference_id, // Optional
          },
        });

        // Award points if applicable
        if (pointsToAward > 0) {
          await updateUserPoints(email, pointsToAward, session.id);
        } else {
          console.log(`No points to award for product ${productId} in session ${session.id}.`);
        }
        break;

      case 'payment_intent.payment_failed':
        const paymentIntentFailed = event.data.object as Stripe.PaymentIntent;
        console.log('Payment intent failed:', paymentIntentFailed.id, 'Reason:', paymentIntentFailed.last_payment_error?.message);

        // Attempt to get email. The customer field might be an ID or an expanded object.
        // The receipt_email is also a good candidate if available.
        let emailForFailedPI = 'unknown@example.com';
        if (paymentIntentFailed.receipt_email) {
          emailForFailedPI = paymentIntentFailed.receipt_email;
        } else if (typeof paymentIntentFailed.customer === 'string') {
          // If customer is an ID, you might need to retrieve the customer object to get the email
          // For now, we'll just log the customer ID if email isn't directly on PI.
          // Consider fetching customer details if email is critical here: const customer = await stripe.customers.retrieve(paymentIntentFailed.customer);
          console.log(`Payment failed for customer ID: ${paymentIntentFailed.customer}, PI: ${paymentIntentFailed.id}`);
        } else if (paymentIntentFailed.customer && 'email' in paymentIntentFailed.customer && paymentIntentFailed.customer.email) {
          // If customer is an expanded object with an email
          emailForFailedPI = paymentIntentFailed.customer.email;
        }
        
        await recordPurchaseEvent({
          email: emailForFailedPI,
          // productId is not directly available on PaymentIntent; this event is primarily for logging the failure.
          // If correlation is needed, it would be via the PaymentIntent ID stored from a CheckoutSession.
          stripeSessionId: paymentIntentFailed.id, // This is the PaymentIntent ID.
          status: 'PAYMENT_FAILED',
          details: { 
            reason: paymentIntentFailed.last_payment_error?.message,
            payment_intent_id: paymentIntentFailed.id,
            latest_charge_id: typeof paymentIntentFailed.latest_charge === 'string' ? paymentIntentFailed.latest_charge : paymentIntentFailed.latest_charge?.id,
            status: paymentIntentFailed.status,
            amount: paymentIntentFailed.amount,
            currency: paymentIntentFailed.currency
          },
        });
        break;

      // Add other event types to handle as needed:
      // case 'payment_intent.succeeded':
      //   // Often checkout.session.completed is preferred as it's higher level
      //   break;
      // case 'charge.refunded':
      //   // Handle refunds, potentially revoking points
      //   break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (processingError: any) {
    console.error(`Error processing webhook event ${event.id} (type: ${event.type}):`, processingError);
    // If you return a 500 here, Stripe will retry. Ensure your processing is idempotent.
    // For critical errors, you might let it retry. For non-retryable errors, return 200 after logging.
    return NextResponse.json({ error: 'Webhook processing error', details: processingError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
