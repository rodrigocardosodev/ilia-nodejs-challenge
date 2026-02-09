import { Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { CreateTransactionUseCase } from "../../application/use-cases/CreateTransactionUseCase";
import { GetBalanceUseCase } from "../../application/use-cases/GetBalanceUseCase";
import { ListTransactionsUseCase } from "../../application/use-cases/ListTransactionsUseCase";
import { AuthenticatedRequest } from "../../../shared/http/authMiddleware";
import { AppError } from "../../../shared/http/AppError";

export class WalletController {
  constructor(
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    private readonly getBalanceUseCase: GetBalanceUseCase,
    private readonly listTransactionsUseCase: ListTransactionsUseCase
  ) {}

  createTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const walletId = req.userId ?? "";
    if (walletId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }

    const schema = z.object({
      type: z.enum(["CREDIT", "DEBIT"]),
      amount: z.number().int().positive()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }

    const idempotencyKey = req.get("Idempotency-Key") ?? randomUUID();
    const result = await this.createTransactionUseCase.execute({
      walletId,
      type: parsed.data.type === "CREDIT" ? "credit" : "debit",
      amount: parsed.data.amount,
      idempotencyKey
    });
    res.status(201).json({
      id: result.transactionId,
      user_id: walletId,
      amount: parsed.data.amount,
      type: parsed.data.type
    });
  };

  deposit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const walletId = req.userId ?? "";
    if (walletId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }

    const schema = z.object({
      amount: z.number().int().positive()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }

    const idempotencyKey = req.get("Idempotency-Key") ?? randomUUID();

    const result = await this.createTransactionUseCase.execute({
      walletId,
      type: "credit",
      amount: parsed.data.amount,
      idempotencyKey
    });
    res.status(201).json({
      id: result.transactionId,
      user_id: walletId,
      amount: parsed.data.amount,
      type: "CREDIT"
    });
  };

  getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const walletId = req.userId ?? "";
    if (walletId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }

    const balance = await this.getBalanceUseCase.execute(walletId);
    res.status(200).json({ amount: balance });
  };

  listTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const walletId = req.userId ?? "";
    if (walletId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }
    const schema = z.object({
      type: z.enum(["CREDIT", "DEBIT"]).optional()
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const type =
      parsed.data.type === "CREDIT" ? "credit" : parsed.data.type === "DEBIT" ? "debit" : undefined;
    const transactions = await this.listTransactionsUseCase.execute(walletId, type);
    res.status(200).json(
      transactions.map((transaction) => ({
        id: transaction.id,
        user_id: transaction.walletId,
        type: transaction.type === "credit" ? "CREDIT" : "DEBIT",
        amount: transaction.amount
      }))
    );
  };
}
