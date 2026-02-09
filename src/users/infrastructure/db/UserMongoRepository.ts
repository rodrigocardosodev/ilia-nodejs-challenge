import { randomUUID } from "crypto";
import { CreateUserInput, UserRepository } from "../../domain/repositories/UserRepository";
import { User } from "../../domain/entities/User";
import { UserModel } from "./mongoose";
import { Metrics } from "../../../shared/observability/metrics";
import { AppError } from "../../../shared/http/AppError";

export class UserMongoRepository implements UserRepository {
  constructor(private readonly metrics: Metrics) { }

  private async timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;
    this.metrics.recordDbQuery("mongo", operation, durationSeconds);
    return result;
  }

  async create(input: CreateUserInput): Promise<User> {
    const normalizedEmail = input.email.toLowerCase();
    const user = new User(
      input.id ?? randomUUID(),
      input.firstName,
      input.lastName,
      normalizedEmail,
      input.password,
      new Date()
    );
    try {
      await this.timed("create_user", () =>
        UserModel.create({
          _id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          password: user.password,
          createdAt: user.createdAt
        })
      );
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError("CONFLICT", 409, "Email already in use");
      }
      throw error;
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await this.timed("find_user_by_id", () =>
      UserModel.findById(id).lean()
    );
    if (!doc) {
      return null;
    }
    return new User(
      doc._id,
      doc.firstName,
      doc.lastName,
      doc.email,
      doc.password,
      new Date(doc.createdAt)
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();
    const doc = await this.timed("find_user_by_email", () =>
      UserModel.findOne({ email: normalizedEmail }).lean()
    );
    if (!doc) {
      return null;
    }
    return new User(
      doc._id,
      doc.firstName,
      doc.lastName,
      doc.email,
      doc.password,
      new Date(doc.createdAt)
    );
  }

  async findAll(): Promise<User[]> {
    const docs = await this.timed("find_users", () => UserModel.find().lean());
    return docs.map(
      (doc) =>
        new User(
          doc._id,
          doc.firstName,
          doc.lastName,
          doc.email,
          doc.password,
          new Date(doc.createdAt)
        )
    );
  }

  async updateById(
    id: string,
    input: Omit<CreateUserInput, "id">
  ): Promise<User | null> {
    const normalizedEmail = input.email.toLowerCase();
    try {
      const doc = await this.timed("update_user", () =>
        UserModel.findByIdAndUpdate(
          id,
          {
            firstName: input.firstName,
            lastName: input.lastName,
            email: normalizedEmail,
            password: input.password
          },
          { new: true }
        ).lean()
      );
      if (!doc) {
        return null;
      }
      return new User(
        doc._id,
        doc.firstName,
        doc.lastName,
        doc.email,
        doc.password,
        new Date(doc.createdAt)
      );
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError("CONFLICT", 409, "Email already in use");
      }
      throw error;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.timed("delete_user", () =>
      UserModel.deleteOne({ _id: id })
    );
    return (result.deletedCount ?? 0) > 0;
  }
}
