import { UserRepository } from "../../domain/repositories/UserRepository";
import { Logger } from "../../../shared/observability/logger";

export class ListUsersUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly logger: Logger
  ) {}

  async execute() {
    this.logger.info("List users started");
    try {
      const users = await this.userRepository.findAll();
      this.logger.info("List users completed", { count: users.length });
      return users;
    } catch (error) {
      this.logger.error("List users failed", { error: String(error) });
      throw error;
    }
  }
}
