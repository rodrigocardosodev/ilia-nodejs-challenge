import { Pool, QueryResult } from "pg";
import {
  ApplyTransactionInput,
  ApplyTransactionResult,
  CompensateTransactionInput,
  CreateSagaInput,
  SagaRecord,
  UpdateSagaInput,
  TransactionRecord,
  TransferBetweenUsersInput,
  TransferBetweenUsersResult,
  WalletRepository
} from "../../domain/repositories/WalletRepository";
import { AppError } from "../../../shared/http/AppError";
import { Metrics } from "../../../shared/observability/metrics";
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  normalizeMoney,
  subtractMoney
} from "../../../shared/money";

export class WalletPostgresRepository implements WalletRepository {
  private readonly duplicateKeyErrorCode = "23505";

  constructor(
    private readonly pool: Pool,
    private readonly metrics: Metrics
  ) {}

  private async timedQuery(
    client: { query: (text: string, params?: unknown[]) => Promise<QueryResult> },
    query: string,
    params: unknown[],
    operation: string
  ): Promise<QueryResult> {
    const start = process.hrtime.bigint();
    const result = await client.query(query, params);
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    this.metrics.recordDbQuery("postgres", operation, durationSeconds);
    return result;
  }

  async ensureWallet(walletId: string): Promise<void> {
    await this.timedQuery(
      this.pool,
      "INSERT INTO wallets (id, balance, version) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
      [walletId, "1000.0000"],
      "ensure_wallet"
    );
  }

  async getBalance(walletId: string): Promise<string> {
    const result = await this.timedQuery(
      this.pool,
      "SELECT balance FROM wallets WHERE id = $1",
      [walletId],
      "get_balance"
    );
    if (result.rows.length === 0) {
      return "0.0000";
    }
    return normalizeMoney(result.rows[0].balance);
  }

  async applyTransaction(input: ApplyTransactionInput): Promise<ApplyTransactionResult> {
    const normalizedAmount = normalizeMoney(input.amount);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.timedQuery(
        client,
        "INSERT INTO wallets (id, balance, version) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
        [input.walletId, "1000.0000"],
        "ensure_wallet"
      );

      const existing = await this.timedQuery(
        client,
        "SELECT id, created_at FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
        [input.walletId, input.idempotencyKey],
        "idempotency_check"
      );

      if ((existing.rowCount ?? 0) > 0) {
        this.metrics.recordIdempotencyHit();
        const balanceResult = await this.timedQuery(
          client,
          "SELECT balance FROM wallets WHERE id = $1",
          [input.walletId],
          "get_balance"
        );
        await client.query("COMMIT");
        return {
          transactionId: existing.rows[0].id,
          createdAt: existing.rows[0].created_at,
          balance: normalizeMoney(balanceResult.rows[0].balance)
        };
      }

      this.metrics.recordIdempotencyMiss();
      const walletResult = await this.timedQuery(
        client,
        "SELECT balance FROM wallets WHERE id = $1 FOR UPDATE",
        [input.walletId],
        "lock_wallet"
      );
      const currentBalance = normalizeMoney(walletResult.rows[0].balance);
      const nextBalance =
        input.type === "credit"
          ? addMoney(currentBalance, normalizedAmount)
          : subtractMoney(currentBalance, normalizedAmount);

      if (compareMoney(nextBalance, "0.0000") < 0) {
        throw new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds");
      }

      const transactionResult = await this.timedQuery(
        client,
        "INSERT INTO transactions (wallet_id, type, amount, idempotency_key) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
        [input.walletId, input.type, normalizedAmount, input.idempotencyKey],
        "insert_transaction"
      );

      await this.timedQuery(
        client,
        "UPDATE wallets SET balance = $1, version = version + 1 WHERE id = $2",
        [nextBalance, input.walletId],
        "update_balance"
      );

      await client.query("COMMIT");
      return {
        transactionId: transactionResult.rows[0].id,
        createdAt: transactionResult.rows[0].created_at,
        balance: nextBalance
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      if (this.isDuplicateKeyError(error)) {
        const existing = await this.timedQuery(
          this.pool,
          "SELECT id, created_at FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
          [input.walletId, input.idempotencyKey],
          "idempotency_check"
        );
        const balanceResult = await this.timedQuery(
          this.pool,
          "SELECT balance FROM wallets WHERE id = $1",
          [input.walletId],
          "get_balance"
        );
        return {
          transactionId: existing.rows[0].id,
          createdAt: existing.rows[0].created_at,
          balance: normalizeMoney(balanceResult.rows[0].balance)
        };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async transferBetweenUsers(
    input: TransferBetweenUsersInput
  ): Promise<TransferBetweenUsersResult> {
    const normalizedAmount = normalizeMoney(input.amount);
    if (!isPositiveMoney(normalizedAmount)) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.timedQuery(
        client,
        "INSERT INTO wallets (id, balance, version) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
        [input.fromWalletId, "1000.0000"],
        "ensure_wallet"
      );
      await this.timedQuery(
        client,
        "INSERT INTO wallets (id, balance, version) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
        [input.toWalletId, "1000.0000"],
        "ensure_wallet"
      );

      const existingDebit = await this.timedQuery(
        client,
        "SELECT id, amount, type FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
        [input.fromWalletId, input.idempotencyKey],
        "idempotency_check"
      );

      if ((existingDebit.rowCount ?? 0) > 0) {
        this.metrics.recordIdempotencyHit();
        const debitRow = existingDebit.rows[0];
        if (
          debitRow.type !== "debit" ||
          compareMoney(normalizeMoney(debitRow.amount), normalizedAmount) !== 0
        ) {
          throw new AppError("CONFLICT", 409, "Idempotency conflict");
        }

        const existingCredit = await this.timedQuery(
          client,
          "SELECT id, amount, type FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
          [input.toWalletId, input.idempotencyKey],
          "idempotency_check"
        );

        if ((existingCredit.rowCount ?? 0) === 0) {
          const receiverWallet = await this.timedQuery(
            client,
            "SELECT balance FROM wallets WHERE id = $1 FOR UPDATE",
            [input.toWalletId],
            "lock_wallet"
          );
          const currentToBalance = normalizeMoney(receiverWallet.rows[0].balance);
          const nextToBalance = addMoney(currentToBalance, normalizedAmount);
          const creditResult = await this.timedQuery(
            client,
            "INSERT INTO transactions (wallet_id, type, amount, idempotency_key) VALUES ($1, $2, $3, $4) RETURNING id",
            [input.toWalletId, "credit", normalizedAmount, input.idempotencyKey],
            "insert_transaction"
          );
          await this.timedQuery(
            client,
            "UPDATE wallets SET balance = $1, version = version + 1 WHERE id = $2",
            [nextToBalance, input.toWalletId],
            "update_balance"
          );
          const fromBalanceResult = await this.timedQuery(
            client,
            "SELECT balance FROM wallets WHERE id = $1",
            [input.fromWalletId],
            "get_balance"
          );
          await client.query("COMMIT");
          return {
            debitTransactionId: debitRow.id,
            creditTransactionId: creditResult.rows[0].id,
            fromBalance: normalizeMoney(fromBalanceResult.rows[0].balance),
            toBalance: nextToBalance
          };
        }

        const creditRow = existingCredit.rows[0];
        if (
          creditRow.type !== "credit" ||
          compareMoney(normalizeMoney(creditRow.amount), normalizedAmount) !== 0
        ) {
          throw new AppError("CONFLICT", 409, "Idempotency conflict");
        }

        const fromBalanceResult = await this.timedQuery(
          client,
          "SELECT balance FROM wallets WHERE id = $1",
          [input.fromWalletId],
          "get_balance"
        );
        const toBalanceResult = await this.timedQuery(
          client,
          "SELECT balance FROM wallets WHERE id = $1",
          [input.toWalletId],
          "get_balance"
        );
        await client.query("COMMIT");
        return {
          debitTransactionId: debitRow.id,
          creditTransactionId: creditRow.id,
          fromBalance: normalizeMoney(fromBalanceResult.rows[0].balance),
          toBalance: normalizeMoney(toBalanceResult.rows[0].balance)
        };
      }

      this.metrics.recordIdempotencyMiss();
      const senderWallet = await this.timedQuery(
        client,
        "SELECT balance FROM wallets WHERE id = $1 FOR UPDATE",
        [input.fromWalletId],
        "lock_wallet"
      );
      const receiverWallet = await this.timedQuery(
        client,
        "SELECT balance FROM wallets WHERE id = $1 FOR UPDATE",
        [input.toWalletId],
        "lock_wallet"
      );
      const currentFromBalance = normalizeMoney(senderWallet.rows[0].balance);
      const currentToBalance = normalizeMoney(receiverWallet.rows[0].balance);
      const nextFromBalance = subtractMoney(currentFromBalance, normalizedAmount);
      if (compareMoney(nextFromBalance, "0.0000") < 0) {
        throw new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds");
      }

      const debitResult = await this.timedQuery(
        client,
        "INSERT INTO transactions (wallet_id, type, amount, idempotency_key) VALUES ($1, $2, $3, $4) RETURNING id",
        [input.fromWalletId, "debit", normalizedAmount, input.idempotencyKey],
        "insert_transaction"
      );
      const creditResult = await this.timedQuery(
        client,
        "INSERT INTO transactions (wallet_id, type, amount, idempotency_key) VALUES ($1, $2, $3, $4) RETURNING id",
        [input.toWalletId, "credit", normalizedAmount, input.idempotencyKey],
        "insert_transaction"
      );

      await this.timedQuery(
        client,
        "UPDATE wallets SET balance = $1, version = version + 1 WHERE id = $2",
        [nextFromBalance, input.fromWalletId],
        "update_balance"
      );
      const nextToBalance = addMoney(currentToBalance, normalizedAmount);
      await this.timedQuery(
        client,
        "UPDATE wallets SET balance = $1, version = version + 1 WHERE id = $2",
        [nextToBalance, input.toWalletId],
        "update_balance"
      );

      await client.query("COMMIT");
      return {
        debitTransactionId: debitResult.rows[0].id,
        creditTransactionId: creditResult.rows[0].id,
        fromBalance: nextFromBalance,
        toBalance: nextToBalance
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      if (this.isDuplicateKeyError(error)) {
        const existingDebit = await this.timedQuery(
          this.pool,
          "SELECT id, amount, type FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
          [input.fromWalletId, input.idempotencyKey],
          "idempotency_check"
        );
        const existingCredit = await this.timedQuery(
          this.pool,
          "SELECT id, amount, type FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
          [input.toWalletId, input.idempotencyKey],
          "idempotency_check"
        );
        if ((existingDebit.rowCount ?? 0) > 0 && (existingCredit.rowCount ?? 0) > 0) {
          const fromBalanceResult = await this.timedQuery(
            this.pool,
            "SELECT balance FROM wallets WHERE id = $1",
            [input.fromWalletId],
            "get_balance"
          );
          const toBalanceResult = await this.timedQuery(
            this.pool,
            "SELECT balance FROM wallets WHERE id = $1",
            [input.toWalletId],
            "get_balance"
          );
          return {
            debitTransactionId: existingDebit.rows[0].id,
            creditTransactionId: existingCredit.rows[0].id,
            fromBalance: normalizeMoney(fromBalanceResult.rows[0].balance),
            toBalance: normalizeMoney(toBalanceResult.rows[0].balance)
          };
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listTransactions(
    walletId: string,
    type?: "credit" | "debit"
  ): Promise<TransactionRecord[]> {
    const params: unknown[] = [walletId];
    let query =
      "SELECT id, wallet_id, type, amount, created_at FROM transactions WHERE wallet_id = $1";
    if (type) {
      params.push(type);
      query += " AND type = $2";
    }
    query += " ORDER BY created_at DESC";
    const result = await this.timedQuery(this.pool, query, params, "list_transactions");
    return result.rows.map((row) => ({
      id: row.id,
      walletId: row.wallet_id,
      type: row.type,
      amount: normalizeMoney(row.amount),
      createdAt: new Date(row.created_at)
    }));
  }

  async createSaga(input: CreateSagaInput): Promise<void> {
    await this.timedQuery(
      this.pool,
      `
        INSERT INTO wallet_sagas
          (id, wallet_id, idempotency_key, transaction_id, type, amount, status, step)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        input.id,
        input.walletId,
        input.idempotencyKey,
        input.transactionId ?? null,
        input.type,
        input.amount,
        input.status,
        input.step
      ],
      "create_saga"
    );
  }

  async findSagaByIdempotencyKey(idempotencyKey: string): Promise<SagaRecord | null> {
    const result = await this.timedQuery(
      this.pool,
      `
        SELECT
          id,
          wallet_id,
          idempotency_key,
          transaction_id,
          type,
          amount,
          status,
          step,
          created_at,
          updated_at
        FROM wallet_sagas
        WHERE idempotency_key = $1
        LIMIT 1
      `,
      [idempotencyKey],
      "find_saga_by_idempotency_key"
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      walletId: row.wallet_id,
      idempotencyKey: row.idempotency_key,
      transactionId: row.transaction_id,
      type: row.type,
      amount: normalizeMoney(row.amount),
      status: row.status,
      step: row.step,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async updateSaga(input: UpdateSagaInput): Promise<void> {
    await this.timedQuery(
      this.pool,
      `
        UPDATE wallet_sagas
        SET status = $2,
            step = $3,
            transaction_id = COALESCE($4, transaction_id),
            updated_at = NOW()
        WHERE id = $1
      `,
      [input.id, input.status, input.step, input.transactionId ?? null],
      "update_saga"
    );
  }

  async compensateTransaction(input: CompensateTransactionInput): Promise<void> {
    const normalizedAmount = normalizeMoney(input.amount);
    if (!isPositiveMoney(normalizedAmount)) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.timedQuery(
        client,
        "INSERT INTO wallets (id, balance, version) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
        [input.walletId, "1000.0000"],
        "ensure_wallet"
      );
      const existing = await this.timedQuery(
        client,
        "SELECT id FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2",
        [input.walletId, input.idempotencyKey],
        "idempotency_check"
      );
      if ((existing.rowCount ?? 0) > 0) {
        await client.query("COMMIT");
        return;
      }
      const walletResult = await this.timedQuery(
        client,
        "SELECT balance FROM wallets WHERE id = $1 FOR UPDATE",
        [input.walletId],
        "lock_wallet"
      );
      const currentBalance = normalizeMoney(walletResult.rows[0].balance);
      const nextBalance =
        input.type === "credit"
          ? addMoney(currentBalance, normalizedAmount)
          : subtractMoney(currentBalance, normalizedAmount);
      if (compareMoney(nextBalance, "0.0000") < 0) {
        throw new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds");
      }
      await this.timedQuery(
        client,
        "INSERT INTO transactions (wallet_id, type, amount, idempotency_key) VALUES ($1, $2, $3, $4)",
        [input.walletId, input.type, normalizedAmount, input.idempotencyKey],
        "insert_compensation_transaction"
      );
      await this.timedQuery(
        client,
        "UPDATE wallets SET balance = $1, version = version + 1 WHERE id = $2",
        [nextBalance, input.walletId],
        "update_balance"
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return false;
    }
    return (error as { code?: string }).code === this.duplicateKeyErrorCode;
  }
}
