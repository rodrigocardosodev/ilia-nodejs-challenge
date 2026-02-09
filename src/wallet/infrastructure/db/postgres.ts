import { Pool } from "pg";

export type PostgresConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export const createPool = (config: PostgresConfig): Pool => {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
  });
};

export const initSchema = async (pool: Pool): Promise<void> => {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      balance BIGINT NOT NULL DEFAULT 1000,
      version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      type TEXT NOT NULL,
      amount BIGINT NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(wallet_id, idempotency_key)
    );
  `);
};
