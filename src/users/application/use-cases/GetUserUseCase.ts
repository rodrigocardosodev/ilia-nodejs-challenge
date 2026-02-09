import { UserRepository } from "../../domain/repositories/UserRepository";
import { Logger } from "../../../shared/observability/logger";

export class GetUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly logger: Logger
  ) {}

  async execute(userId: string) {
    this.logger.info("Get user started", { userId });
    try {
      const user = await this.userRepository.findById(userId);
      this.logger.info("Get user completed", { userId, found: Boolean(user) });
      return user;
    } catch (error) {
      this.logger.error("Get user failed", { userId, error: String(error) });
      throw error;
    }
  }
}
