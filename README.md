This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Admin Purchase System Project

This project implements an admin interface for initiating product purchases, handling payments via Stripe, and managing user points with a Neon (PostgreSQL) database.

### Key Logic and Behaviors

*   **Payment Failure Logging**: When a payment fails (e.g., due to insufficient funds, a generic card decline, etc.), the system logs the event in the `purchase_events` table. If multiple failure attempts occur for the same underlying payment intent (e.g., a user tries a card, it fails, then they try another card which also fails), the database record for that payment intent will be updated to reflect the reason and details of the *most recent* failure. The `product_id` will be `null` and `points_awarded` will be `0` for these failure events.
*   **User Points Management**: When a payment is successful, the system updates the user's points in the `user_points` table. The points are added to the user's total points balance.
*   **User Purchase History**: The system logs each purchase in the `purchase_events` table, including the product purchased, the amount paid, and the points awarded.
*   **Hack prevention**: The system prevents users from manually changing points, price or product_id in the payment process page.

## Getting Started

Follow these steps to set up and run the project locally:

### 1. Prerequisites

*   Node.js (v18.x or later recommended)
*   npm, yarn, or pnpm (npm is used in these instructions)
*   [Stripe CLI](https://stripe.com/docs/stripe-cli) (for testing webhooks locally)
*   Access to a Neon database account (or any PostgreSQL database)
*   Access to a Stripe account

### 2. Clone the Repository

```bash
git clone <repository-url>
cd <repository-directory>
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables



*   Copy the template file `.env.template` to a new file named `.env.local` in the project root:
    ```bash
    cp .env.template .env.local
    ```
*   Open `.env.local` and fill in the required values:
    *   `ADMIN_USERNAME`, `ADMIN_PASSWORD`: Credentials for a conceptual admin user (currently not strictly enforced but planned).
    *   `STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable API key (e.g., `pk_test_...`).
    *   `STRIPE_SECRET_KEY`: Your Stripe secret API key (e.g., `sk_test_...`).
    *   `STRIPE_WEBHOOK_SECRET`: This will be obtained in a later step when setting up the Stripe CLI for webhook forwarding. Leave it blank for now or use a placeholder.
    *   `NEON_DATABASE_URL`: Your Neon database connection string (e.g., `postgresql://user:password@host:port/dbname?sslmode=require`).
    *   `NEXT_PUBLIC_APP_URL`: The base URL for your application (e.g., `http://localhost:3000` for local development).
    *   `ADMIN_INIT_DB_SECRET`: A secret key for the database initialization API endpoint (e.g., `your-very-secret-key-for-db-init`).
    *   `ADMIN_API_SECRET`: A secret key for accessing protected admin data APIs (e.g., `your-admin-api-secret-key`).
    *   `NEXT_PUBLIC_ADMIN_API_SECRET`: The same value as `ADMIN_API_SECRET`. This is used for client-side calls to admin APIs (ensure your security model is appropriate for this).
    *   `ALLOWED_ORIGINS`: A comma-separated list of URLs that are permitted to make cross-origin requests to your Next.js API routes (e.g., `/api/*`). This is handled by the `src/middleware.ts` file. Example: `ALLOWED_ORIGINS=http://localhost:3001,https://your-frontend.com,app://my-mobile-app-origin`.
        -   **Why Stripe domains are NOT needed here:**
            -   The `ALLOWED_ORIGINS` setting controls which frontend domains can call *your* backend API.
            -   **Stripe Webhooks (Stripe -> Your Server):** These are server-to-server requests initiated by Stripe. They are secured by webhook signature verification (`STRIPE_WEBHOOK_SECRET`), not by CORS origin checks.
            -   **Your Server -> Stripe API:** When your backend calls Stripe's API, these are also server-to-server and not subject to browser CORS policies.
            -   **Client-Side Stripe.js (User's Browser -> Stripe):** Stripe's own servers are already configured to accept requests from browsers running Stripe.js from any domain. Your `ALLOWED_ORIGINS` setting does not affect this.
        -   You should list the origins of your frontend applications (e.g., `http://localhost:3001` if your frontend runs on a different port during development, or `https://your-production-frontend.com`).

### 5. Run the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 6. Initialize Database Schema

*   Once the development server is running, navigate to the admin page: [http://localhost:3000/admin](http://localhost:3000/admin).
*   On the admin page, find the "Database Management" section.
*   Click the "Initialize/Verify DB Schema" button.
*   Check your terminal console (where `npm run dev` is running) for logs confirming that the `purchase_events` and `user_points` tables were created or already exist.

### 7. Set Up Stripe Webhook for Local Testing

To test the complete payment flow, including webhook events for successful payments and point updates, you need to forward Stripe events to your local development server.
*   **Create a Stripe Sandbox**: Go to [https://dashboard.stripe.com/test](https://dashboard.stripe.com/test) and create a new sandbox account.
*   **Install Stripe CLI**: If you haven't already, [install the Stripe CLI](https://docs.stripe.com/stripe-cli). We'll use the CLI to forward webhook events to your local development server (a little bit like `ngrok`).
*   **Log in to Stripe CLI**: login to the sandbox account using the Stripe CLI.
    ```bash
    stripe login
    ```
*   **Forward Webhook Events**: Run the following command in a new terminal window. This command tells Stripe to send webhook events to your local application's webhook handler.
    ```bash
    stripe listen --forward-to localhost:3000/api/webhooks/stripe
    ```
*   The Stripe CLI will output a **webhook signing secret** (it will look like `whsec_...`). 
*   **Copy this `whsec_...` secret.**
*   **Update `.env.local`**: Paste the copied webhook signing secret into your `.env.local` file for the `STRIPE_WEBHOOK_SECRET` variable.
*   **Restart Development Server**: If your `npm run dev` server was already running, you might need to stop it (Ctrl+C) and restart it for the new `STRIPE_WEBHOOK_SECRET` environment variable to be loaded.

### 8. Test the Application

*   Navigate to the admin page: [http://localhost:3000/admin](http://localhost:3000/admin).
*   **Initiate a Purchase**: Enter a test email address and select a product to create a purchase request.
*   You will be redirected to the checkout page, and then to Stripe's checkout.
*   **Complete Payment**: Use Stripe's [test card numbers](https://docs.stripe.com/testings) to simulate a successful payment and a failed payments (there are special card numbers for that).
*   After payment, you should be redirected back to the application's checkout page with a success message.
*   **Verify Webhook Processing**: 
    *   Check the terminal where `stripe listen` is running. You should see event logs (e.g., `checkout.session.completed`).
    *   Check the terminal where `npm run dev` is running. You should see logs from your webhook handler (`src/app/api/webhooks/stripe/route.ts`) indicating event processing and database updates.
*   **Verify Data in Admin Dashboard**: 
    *   Go back to the admin page.
    *   The "All Purchase Events" table should display the new transaction.
    *   Use the "User Data Lookup" section to search for the email used in the test purchase. You should see their updated points total and the recent transaction in their history.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### 9. What you can do with this project

This project serves as a robust foundation for an admin-driven purchase system. Here are some common customizations and operational considerations:

*   **Managing Products**:
    *   Products (name, price, points awarded) are defined in `src/lib/products.ts`.
    *   To add, remove, or modify products, edit the `products` array in this file. Ensure each product has a unique `id`.
    *   The `price` is in Euros (or your store's primary currency) and should match the price you intend to charge via Stripe.
    *   The `points` are the loyalty points awarded upon successful purchase.

*   **Configuring for Production (Stripe)**:
    *   **Live API Keys**: In your Stripe Dashboard, switch to "Live mode". Obtain your live publishable key (`pk_live_...`) and secret key (`sk_live_...`).
    *   **Production Environment Variables**: Update your production environment's `.env.local` (or your hosting provider's environment variable settings) with these live keys for `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.
    *   **Webhook Endpoint**:
        *   In your Stripe Dashboard (Live mode), go to "Developers" -> "Webhooks".
        *   Click "Add endpoint".
        *   Set the "Endpoint URL" to `https://<your-production-domain>/api/webhooks/stripe`.
        *   Select the events to listen to:
            *   `checkout.session.completed`
            *   `payment_intent.payment_failed`
        *   Click "Add endpoint". Stripe will reveal a "Signing secret" (`whsec_...`) for this live endpoint.
        *   Update `STRIPE_WEBHOOK_SECRET` in your production environment variables with this new live signing secret.
    *   **Important**: Never commit your live Stripe secret keys or webhook secrets to your Git repository. Use environment variables.

*   **Customizing the Checkout Page**:
    *   The "Back to Admin" button on the checkout page (`src/app/checkout/page.tsx`) is primarily for convenience during development or if the checkout is always initiated from an admin context.
    *   To remove or conditionally render it (e.g., if the checkout flow can be accessed by non-admin users), modify the JSX in `src/app/checkout/page.tsx`. You might hide it based on a query parameter or user session status if you implement user roles.

*   **Deploying to Vercel (and similar platforms)**:
    *   **Environment Variables**: Configure all necessary environment variables (from your `.env.local`, but with production values) in your Vercel project settings. This includes `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (for live mode), `NEON_DATABASE_URL`, `ADMIN_INIT_DB_SECRET`, `ADMIN_API_SECRET`, `NEXT_PUBLIC_APP_URL` (set to your Vercel domain), and `ALLOWED_ORIGINS`.
    *   **Build Command**: Vercel typically auto-detects Next.js projects and uses `npm run build` or `next build`.
    *   **Output Directory**: Usually `.next`.
    *   **Node.js Version**: Ensure your Vercel project's Node.js version is compatible (e.g., 18.x or later).
    *   **Database Access**: If your Neon database (or other PostgreSQL provider) has IP allowlisting, ensure Vercel's deployment IPs can access it. Neon typically works well with serverless functions without IP allowlisting if using the connection string correctly.
    *   **Custom Domain**: After deployment, you'll likely want to set up a custom domain through Vercel and update `NEXT_PUBLIC_APP_URL` accordingly.

*   **Further Development**:
    *   **User Authentication/Authorization**: Implement a proper authentication system if non-admin users need to access parts of the application or if you want more granular admin roles.
    *   **Enhanced Product Management**: For a larger number of products, consider managing them in the database rather than a static file.
    *   **Refined UI/UX**: Improve the styling and user experience of the admin and checkout pages.


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
