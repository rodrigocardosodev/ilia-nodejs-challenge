import Redis from "ioredis";
import { CreateUserInput, UserRepository } from "../../domain/repositories/UserRepository";
import { User } from "../../domain/entities/User";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";

type CachedUserData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  createdAt: string;
};

export class CachedUserRepository implements UserRepository {
  private readonly ttlSeconds = 120;

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
        this.ttlSeconds
      );
      await this.redis.set(this.emailKey(user.email), user.id, "EX", this.ttlSeconds);
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
        const data = JSON.parse(cached) as CachedUserData;
        if (data.id && data.email && data.password && data.createdAt) {
          this.metrics.recordCacheHit("users_by_id");
          return new User(
            data.id,
            data.firstName,
            data.lastName,
            data.email,
            data.password,
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
        await this.redis.set(
          this.userKey(id),
          JSON.stringify(this.toCacheData(user)),
          "EX",
          this.ttlSeconds
        );
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
        const user = await this.findById(cachedId);
        if (user) {
          return user;
        }
        await this.redis.del(this.emailKey(email));
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
          this.ttlSeconds
        );
        await this.redis.set(this.emailKey(user.email), user.id, "EX", this.ttlSeconds);
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
    const existing = await this.baseRepository.findById(id);
    const user = await this.baseRepository.updateById(id, input);
    if (!user) {
      return null;
    }
    try {
      await this.redis.set(
        this.userKey(user.id),
        JSON.stringify(this.toCacheData(user)),
        "EX",
        this.ttlSeconds
      );
      await this.redis.set(this.emailKey(user.email), user.id, "EX", this.ttlSeconds);
      if (existing && existing.email.toLowerCase() !== user.email.toLowerCase()) {
        await this.redis.del(this.emailKey(existing.email));
      }
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
    password: string;
    createdAt: string;
  } {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: user.password,
      createdAt: user.createdAt.toISOString()
    };
  }
}
