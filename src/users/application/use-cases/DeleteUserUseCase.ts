import { UserRepository } from "../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/http/AppError";
import { Logger } from "../../../shared/observability/logger";

export class DeleteUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly logger: Logger
  ) {}

  async execute(userId: string): Promise<void> {
    this.logger.info("Delete user started", { userId });
    try {
      const deleted = await this.userRepository.deleteById(userId);
      if (!deleted) {
        throw new AppError("NOT_FOUND", 404, "User not found");
      }
      this.logger.info("Delete user completed", { userId });
    } catch (error) {
      this.logger.error("Delete user failed", { userId, error: String(error) });
      throw error;
    }
  }
}
