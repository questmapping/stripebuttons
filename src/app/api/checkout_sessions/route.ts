import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { products, getProductById } from '@/lib/products';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil', // Use the latest API version
  typescript: true,
});

/**
 * @swagger
 * /api/checkout_sessions:
 *   post:
 *     summary: Creates a Stripe Checkout Session for a product purchase.
 *     description: >
 *       Accepts a user's email and a product ID, then creates a Stripe Checkout Session.
 *       The session includes product details, price, and metadata (email, productId, points)
 *       which will be used by the Stripe webhook upon successful payment.
 *       Redirects the user to Stripe's hosted checkout page.
 *     tags:
 *       - Stripe Checkout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - productId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user making the purchase.
 *                 example: user@example.com
 *               productId:
 *                 type: string
 *                 description: The ID of the product being purchased.
 *                 example: prod_20euro
 *     responses:
 *       200:
 *         description: Successfully created Stripe Checkout Session.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   description: The ID of the created Stripe Checkout Session.
 *                   example: cs_test_a1b2c3d4e5f6g7h8i9j0
 *       400:
 *         description: Bad Request - Email and Product ID are required.
 *       404:
 *         description: Not Found - Invalid Product ID.
 *       500:
 *         description: Internal Server Error - Failed to create Stripe session.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, productId } = await req.json();

    if (!email || !productId) {
      return NextResponse.json({ error: 'Email and Product ID are required' }, { status: 400 });
    }

    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json({ error: 'Invalid Product ID' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: product.name,
              description: `Purchase of ${product.name} for ${product.points} points`,
            },
            unit_amount: product.price * 100, // Price in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Pass email and productId in success_url to repopulate checkout page if needed for display, though session_id is primary for verification
      success_url: `${appUrl}/checkout?payment_success=true&session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}&productId=${productId}`,
      // Pass email and productId to cancel_url to allow user to easily retry or see what was cancelled
      cancel_url: `${appUrl}/checkout?payment_cancelled=true&email=${encodeURIComponent(email)}&productId=${productId}&session_id={CHECKOUT_SESSION_ID}`,
      customer_email: email, // Pre-fills email on Stripe's page
      metadata: {
        // Store email, productId, and points in metadata for webhook processing
        email: email,
        productId: productId,
        points: product.points.toString(), // Stripe metadata values must be strings
      },
    });

    if (!session.id) {
        throw new Error('Failed to create Stripe session.');
    }

    return NextResponse.json({ sessionId: session.id });

  } catch (error: any) {
    console.error('Stripe session creation error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
