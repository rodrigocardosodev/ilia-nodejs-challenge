import { User } from "../../../src/users/domain/entities/User";
import { Wallet } from "../../../src/wallet/domain/entities/Wallet";
import { Transaction } from "../../../src/wallet/domain/entities/Transaction";

describe("domain entities", () => {
  it("cria usuário", () => {
    const createdAt = new Date("2024-01-01");
    const user = new User("user-1", "Ana", "Silva", "a@a.com", "hash", createdAt);

    expect(user.id).toBe("user-1");
    expect(user.firstName).toBe("Ana");
    expect(user.lastName).toBe("Silva");
    expect(user.email).toBe("a@a.com");
    expect(user.password).toBe("hash");
    expect(user.createdAt).toBe(createdAt);
  });

  it("cria carteira", () => {
    const wallet = new Wallet("wallet-1", 100, 2);

    expect(wallet.id).toBe("wallet-1");
    expect(wallet.balance).toBe(100);
    expect(wallet.version).toBe(2);
  });

  it("cria transação", () => {
    const createdAt = new Date("2024-01-01");
    const transaction = new Transaction(
      "tx-1",
      "wallet-1",
      "credit",
      50,
      "idem-1",
      createdAt
    );

    expect(transaction.id).toBe("tx-1");
    expect(transaction.walletId).toBe("wallet-1");
    expect(transaction.type).toBe("credit");
    expect(transaction.amount).toBe(50);
    expect(transaction.idempotencyKey).toBe("idem-1");
    expect(transaction.createdAt).toBe(createdAt);
  });
});
