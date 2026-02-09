import { UserRepository } from "../../domain/repositories/UserRepository";
import { PasswordHasher } from "../ports/PasswordHasher";
import { AppError } from "../../../shared/http/AppError";
import { User } from "../../domain/entities/User";
import { Logger } from "../../../shared/observability/logger";

export type AuthenticateUserInput = {
  email: string;
  password: string;
};

export class AuthenticateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger
  ) {}

  async execute(input: AuthenticateUserInput): Promise<User> {
    this.logger.info("User authentication started");

    let user: User | null = null;
    try {
      user = await this.userRepository.findByEmail(input.email);
      if (!user) {
        throw new AppError("UNAUTHORIZED", 401, "Invalid credentials");
      }

      const isValid = await this.passwordHasher.compare(input.password, user.password);
      if (!isValid) {
        throw new AppError("UNAUTHORIZED", 401, "Invalid credentials");
      }

      this.logger.info("User authentication completed", { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error("User authentication failed", {
        userId: user?.id,
        error: String(error)
      });
      throw error;
    }
  }
}
