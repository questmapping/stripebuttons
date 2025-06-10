import { Pool, neon } from '@neondatabase/serverless';
import { NextApiRequest, NextApiResponse } from 'next';

if (!process.env.NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

// SQL execution function
export async function sql(query: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

// Function to initialize database schema
export async function initializeDbSchema() {
  const createPurchaseEventsTable = `
    CREATE TABLE IF NOT EXISTS purchase_events (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      email VARCHAR(255) NOT NULL,
      product_id VARCHAR(100),
      stripe_session_id VARCHAR(255) UNIQUE,
      status VARCHAR(50) NOT NULL, -- e.g., 'INITIATED', 'SUCCESS', 'FAILED', 'CANCELLED', 'POINTS_UPDATED', 'POINTS_UPDATE_FAILED',
      seller_id INTEGER NOT NULL DEFAULT 0,
      points_awarded INTEGER,
      details JSONB
    );
  `;

  const createUserPointsTable = `
    CREATE TABLE IF NOT EXISTS user_points (
      email VARCHAR(255) PRIMARY KEY,
      total_points INTEGER DEFAULT 0 NOT NULL,
      last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Create indexes for frequently queried columns
  const createIndexEmailEvents = `CREATE INDEX IF NOT EXISTS idx_purchase_events_email ON purchase_events(email);`;
  const createIndexStatusEvents = `CREATE INDEX IF NOT EXISTS idx_purchase_events_status ON purchase_events(status);`;
  const createIndexStripeIdEvents = `CREATE INDEX IF NOT EXISTS idx_purchase_events_stripe_session_id ON purchase_events(stripe_session_id);`;

  try {
    await sql(createPurchaseEventsTable);
    console.log('Checked/created purchase_events table.');

    // Add seller_id column if it doesn't exist, to support migration from older schema.
    const addSellerIdColumn = `ALTER TABLE purchase_events ADD COLUMN IF NOT EXISTS seller_id INTEGER NOT NULL DEFAULT 0;`;
    await sql(addSellerIdColumn);
    console.log('Ensured seller_id column exists in purchase_events table.');

    await sql(createUserPointsTable);
    console.log('Checked/created user_points table.');

    await sql(createIndexEmailEvents);
    await sql(createIndexStatusEvents);
    await sql(createIndexStripeIdEvents);
    console.log('Checked/created indexes for purchase_events table.');

    console.log('Database schema initialization complete.');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error; // Re-throw to indicate failure
  }
}

// Example of an API handler to trigger schema initialization (optional, for dev purposes)
// You might call initializeDbSchema() at application startup or via a specific admin action.
// For Vercel, serverless functions are stateless, so this might be best run during a build step
// or a dedicated initialization endpoint hit once.

/*
// Example: pages/api/init-db.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') { // Or GET, ensure it's protected if public
    try {
      await initializeDbSchema();
      res.status(200).json({ message: 'Database schema initialized successfully.' });
    } catch (error) {
      console.error('Failed to initialize DB schema:', error);
      res.status(500).json({ message: 'Failed to initialize database schema.', error: (error as Error).message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
*/

// We can also export the neon http proxy for more direct queries if needed, though pool is generally preferred for connection management.
export const neonSql = neon(process.env.NEON_DATABASE_URL!);
