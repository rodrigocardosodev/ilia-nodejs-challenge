import Redis from "ioredis";
import { CreateUserInput, UserRepository } from "../../domain/repositories/UserRepository";
import { User } from "../../domain/entities/User";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";

export class CachedUserRepository implements UserRepository {
  constructor(
    private readonly redis: Redis,
    private readonly baseRepository: UserRepository,
    private readonly metrics: Metrics,
    private readonly logger: Logger
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.baseRepository.create(input);
    try {
      await this.redis.set(
        this.userKey(user.id),
        JSON.stringify(this.toCacheData(user)),
        "EX",
        120
      );
      await this.redis.set(this.emailKey(user.email), user.id, "EX", 120);
    } catch (error) {
      this.logger.warn("Failed to cache user after create", {
        userId: user.id,
        error: String(error)
      });
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    try {
      const cached = await this.redis.get(this.userKey(id));
      if (cached) {
        const data = JSON.parse(cached);
        if (data.id && data.email && data.createdAt) {
          this.metrics.recordCacheHit("users_by_id");
          return new User(
            data.id,
            data.firstName,
            data.lastName,
            data.email,
            "",
            new Date(data.createdAt)
          );
        }
      }
    } catch (error) {
      this.logger.warn("Failed to read user cache by id", {
        userId: id,
        error: String(error)
      });
    }
    this.metrics.recordCacheMiss("users_by_id");
    const user = await this.baseRepository.findById(id);
    if (user) {
      try {
        await this.redis.set(this.userKey(id), JSON.stringify(this.toCacheData(user)), "EX", 120);
      } catch (error) {
        this.logger.warn("Failed to update user cache by id", {
          userId: id,
          error: String(error)
        });
      }
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const cachedId = await this.redis.get(this.emailKey(email));
      if (cachedId) {
        this.metrics.recordCacheHit("users_by_email");
        return this.baseRepository.findById(cachedId);
      }
    } catch (error) {
      this.logger.warn("Failed to read user cache by email", {
        email,
        error: String(error)
      });
    }
    this.metrics.recordCacheMiss("users_by_email");
    const user = await this.baseRepository.findByEmail(email);
    if (user) {
      try {
        await this.redis.set(
          this.userKey(user.id),
          JSON.stringify(this.toCacheData(user)),
          "EX",
          120
        );
        await this.redis.set(this.emailKey(email), user.id, "EX", 120);
      } catch (error) {
        this.logger.warn("Failed to update user cache by email", {
          userId: user.id,
          email,
          error: String(error)
        });
      }
    }
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.baseRepository.findAll();
  }

  async updateById(id: string, input: Omit<CreateUserInput, "id">): Promise<User | null> {
    const user = await this.baseRepository.updateById(id, input);
    if (!user) {
      return null;
    }
    try {
      await this.redis.set(
        this.userKey(user.id),
        JSON.stringify(this.toCacheData(user)),
        "EX",
        120
      );
      await this.redis.set(this.emailKey(user.email), user.id, "EX", 120);
    } catch (error) {
      this.logger.warn("Failed to update user cache after update", {
        userId: user.id,
        error: String(error)
      });
    }
    return user;
  }

  async deleteById(id: string): Promise<boolean> {
    const user = await this.baseRepository.findById(id);
    const deleted = await this.baseRepository.deleteById(id);
    if (deleted && user) {
      try {
        await this.redis.del(this.userKey(id));
        await this.redis.del(this.emailKey(user.email));
      } catch (error) {
        this.logger.warn("Failed to remove user cache after delete", {
          userId: id,
          error: String(error)
        });
      }
    }
    return deleted;
  }

  private userKey(id: string): string {
    return `users:id:${id}`;
  }

  private emailKey(email: string): string {
    return `users:email:${email.toLowerCase()}`;
  }

  private toCacheData(user: User): {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
  } {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt.toISOString()
    };
  }
}
