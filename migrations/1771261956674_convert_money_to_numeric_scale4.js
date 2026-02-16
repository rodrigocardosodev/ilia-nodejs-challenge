exports.up = (pgm) => {
  pgm.alterColumn("wallets", "balance", {
    type: "numeric(18,4)",
    using: "balance::numeric(18,4)",
    notNull: true,
    default: "1000.0000"
  });

  pgm.alterColumn("transactions", "amount", {
    type: "numeric(18,4)",
    using: "amount::numeric(18,4)",
    notNull: true
  });

  pgm.alterColumn("wallet_sagas", "amount", {
    type: "numeric(18,4)",
    using: "amount::numeric(18,4)",
    notNull: true
  });
};

exports.down = (pgm) => {
  pgm.alterColumn("wallet_sagas", "amount", {
    type: "bigint",
    using: "amount::bigint",
    notNull: true
  });

  pgm.alterColumn("transactions", "amount", {
    type: "bigint",
    using: "amount::bigint",
    notNull: true
  });

  pgm.alterColumn("wallets", "balance", {
    type: "bigint",
    using: "balance::bigint",
    notNull: true,
    default: 1000
  });
};
