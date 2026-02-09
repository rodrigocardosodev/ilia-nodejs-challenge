import { randomUUID } from "crypto";
import { CreateUserInput, UserRepository } from "../../domain/repositories/UserRepository";
import { EventPublisher } from "../ports/EventPublisher";
import { PasswordHasher } from "../ports/PasswordHasher";
import { AppError } from "../../../shared/http/AppError";
import { Logger } from "../../../shared/observability/logger";

export type RegisterUserOutput = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  created: boolean;
};

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: Logger
  ) {}

  async execute(input: CreateUserInput): Promise<RegisterUserOutput> {
    this.logger.info("User registration started", {
      userId: input.id
    });

    try {
      const existing = await this.userRepository.findByEmail(input.email);
      if (existing) {
        if (input.id && existing.id !== input.id) {
          throw new AppError("CONFLICT", 409, "Email already in use");
        }
        this.logger.info("User registration reused existing user", {
          userId: existing.id
        });
        return {
          id: existing.id,
          firstName: existing.firstName,
          lastName: existing.lastName,
          email: existing.email,
          createdAt: existing.createdAt,
          created: false
        };
      }

      const hashedPassword = await this.passwordHasher.hash(input.password);

      const user = await this.userRepository.create({
        id: input.id ?? randomUUID(),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: hashedPassword
      });

      try {
        const name = `${user.firstName} ${user.lastName}`.trim();
        await this.eventPublisher.publish({
          name: "users.created",
          payload: {
            eventId: randomUUID(),
            occurredAt: new Date().toISOString(),
            userId: user.id,
            name,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          }
        });
      } catch (error) {
        this.logger.error("Failed to publish users.created event", {
          userId: user.id,
          error: String(error)
        });
      }

      this.logger.info("User registration completed", {
        userId: user.id,
        created: true
      });

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
        created: true
      };
    } catch (error) {
      this.logger.error("User registration failed", {
        userId: input.id,
        error: String(error)
      });
      throw error;
    }
  }
}
