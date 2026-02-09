exports.up = (pgm) => {
  pgm.createTable(
    "wallet_sagas",
    {
      id: {
        type: "uuid",
        primaryKey: true
      },
      wallet_id: {
        type: "text",
        notNull: true,
        references: "wallets",
        onDelete: "cascade"
      },
      idempotency_key: { type: "text", notNull: true, unique: true },
      transaction_id: { type: "uuid" },
      type: { type: "text", notNull: true },
      amount: { type: "bigint", notNull: true },
      status: { type: "text", notNull: true },
      step: { type: "text", notNull: true },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()")
      },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()")
      }
    },
    { ifNotExists: true }
  );
};

exports.down = (pgm) => {
  pgm.dropTable("wallet_sagas");
};
