exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createTable("wallets", {
    id: { type: "text", primaryKey: true },
    balance: { type: "bigint", notNull: true, default: 1000 },
    version: { type: "integer", notNull: true, default: 0 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  }, { ifNotExists: true });
  pgm.createTable("transactions", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()")
    },
    wallet_id: {
      type: "text",
      notNull: true,
      references: "wallets",
      onDelete: "cascade"
    },
    type: { type: "text", notNull: true },
    amount: { type: "bigint", notNull: true },
    idempotency_key: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  }, { ifNotExists: true });
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_wallet_id_idempotency_key_unique'
      ) THEN
        ALTER TABLE "transactions"
          ADD CONSTRAINT "transactions_wallet_id_idempotency_key_unique"
          UNIQUE ("wallet_id", "idempotency_key");
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("transactions");
  pgm.dropTable("wallets");
};
