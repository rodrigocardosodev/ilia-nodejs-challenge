import { UserRepository } from "../../domain/repositories/UserRepository";
import { PasswordHasher } from "../ports/PasswordHasher";
import { AppError } from "../../../shared/http/AppError";
import { Logger } from "../../../shared/observability/logger";

export type UpdateUserInput = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export class UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger
  ) {}

  async execute(input: UpdateUserInput) {
    this.logger.info("Update user started", { userId: input.id });
    try {
      const hashedPassword = await this.passwordHasher.hash(input.password);
      const user = await this.userRepository.updateById(input.id, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: hashedPassword
      });
      if (!user) {
        throw new AppError("NOT_FOUND", 404, "User not found");
      }
      this.logger.info("Update user completed", { userId: input.id });
      return user;
    } catch (error) {
      this.logger.error("Update user failed", { userId: input.id, error: String(error) });
      throw error;
    }
  }
}
