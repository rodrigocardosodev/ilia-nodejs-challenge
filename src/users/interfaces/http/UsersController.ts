import { Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { RegisterUserUseCase } from "../../application/use-cases/RegisterUserUseCase";
import { GetUserUseCase } from "../../application/use-cases/GetUserUseCase";
import { AuthenticateUserUseCase } from "../../application/use-cases/AuthenticateUserUseCase";
import { ListUsersUseCase } from "../../application/use-cases/ListUsersUseCase";
import { UpdateUserUseCase } from "../../application/use-cases/UpdateUserUseCase";
import { DeleteUserUseCase } from "../../application/use-cases/DeleteUserUseCase";
import { AuthenticatedRequest } from "../../../shared/http/authMiddleware";
import { AppError } from "../../../shared/http/AppError";

export class UsersController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly getUserUseCase: GetUserUseCase,
    private readonly authenticateUserUseCase: AuthenticateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly jwtKey: string
  ) { }

  register = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const schema = z.object({
      first_name: z.string().min(2),
      last_name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }

    const result = await this.registerUserUseCase.execute({
      firstName: parsed.data.first_name,
      lastName: parsed.data.last_name,
      email: parsed.data.email,
      password: parsed.data.password
    });

    res.status(201).json({
      id: result.id,
      first_name: result.firstName,
      last_name: result.lastName,
      email: result.email
    });
  };

  login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }

    const user = await this.authenticateUserUseCase.execute({
      email: parsed.data.email,
      password: parsed.data.password
    });

    const token = jwt.sign({ sub: user.id }, this.jwtKey, {
      expiresIn: "1h",
      algorithm: "HS256"
    });

    res.status(200).json({
      access_token: token,
      user: {
        id: user.id,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email
      }
    });
  };

  list = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const users = await this.listUsersUseCase.execute();
    res.status(200).json(
      users.map((user) => ({
        id: user.id,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email
      }))
    );
  };

  getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const userId = typeof rawId === "string" ? rawId : "";
    if (userId.length === 0) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const requesterId = req.userId ?? "";
    if (requesterId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }
    if (requesterId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Forbidden");
    }
    const user = await this.getUserUseCase.execute(userId);
    if (!user) {
      throw new AppError("NOT_FOUND", 404, "User not found");
    }
    res.status(200).json({
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email
    });
  };

  update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const userId = typeof rawId === "string" ? rawId : "";
    if (userId.length === 0) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const requesterId = req.userId ?? "";
    if (requesterId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }
    if (requesterId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Forbidden");
    }
    const schema = z.object({
      first_name: z.string().min(2),
      last_name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const user = await this.updateUserUseCase.execute({
      id: userId,
      firstName: parsed.data.first_name,
      lastName: parsed.data.last_name,
      email: parsed.data.email,
      password: parsed.data.password
    });
    res.status(200).json({
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email
    });
  };

  remove = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const userId = typeof rawId === "string" ? rawId : "";
    if (userId.length === 0) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    const requesterId = req.userId ?? "";
    if (requesterId.length === 0) {
      throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
    }
    if (requesterId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Forbidden");
    }
    await this.deleteUserUseCase.execute(userId);
    res.status(200).send();
  };
}
