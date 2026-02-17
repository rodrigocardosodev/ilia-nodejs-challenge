import { CachedUserRepository } from "../../../src/users/infrastructure/cache/CachedUserRepository";
import { User } from "../../../src/users/domain/entities/User";

describe("CachedUserRepository", () => {
  it("retorna usuário completo do cache por id", async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          id: "user-1",
          firstName: "Ana",
          lastName: "Silva",
          email: "ana@x.com",
          password: "hash-1",
          createdAt: "2026-02-17T00:00:00.000Z"
        })
      ),
      set: jest.fn(),
      del: jest.fn()
    };
    const baseRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn()
    };
    const metrics = { recordCacheHit: jest.fn(), recordCacheMiss: jest.fn() };
    const logger = { warn: jest.fn() };

    const repository = new CachedUserRepository(
      redis as any,
      baseRepository as any,
      metrics as any,
      logger as any
    );

    const user = await repository.findById("user-1");

    expect(user).toEqual(
      new User("user-1", "Ana", "Silva", "ana@x.com", "hash-1", new Date("2026-02-17T00:00:00.000Z"))
    );
    expect(baseRepository.findById).not.toHaveBeenCalled();
    expect(metrics.recordCacheHit).toHaveBeenCalledWith("users_by_id");
  });

  it("remove chave de email antigo ao atualizar email", async () => {
    const redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1)
    };
    const oldUser = new User(
      "user-1",
      "Ana",
      "Silva",
      "old@x.com",
      "hash-old",
      new Date("2026-02-17T00:00:00.000Z")
    );
    const updatedUser = new User(
      "user-1",
      "Ana",
      "Silva",
      "new@x.com",
      "hash-new",
      new Date("2026-02-17T00:00:00.000Z")
    );
    const baseRepository = {
      findById: jest.fn().mockResolvedValue(oldUser),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn().mockResolvedValue(updatedUser),
      deleteById: jest.fn()
    };
    const metrics = { recordCacheHit: jest.fn(), recordCacheMiss: jest.fn() };
    const logger = { warn: jest.fn() };

    const repository = new CachedUserRepository(
      redis as any,
      baseRepository as any,
      metrics as any,
      logger as any
    );

    const user = await repository.updateById("user-1", {
      firstName: "Ana",
      lastName: "Silva",
      email: "new@x.com",
      password: "hash-new"
    });

    expect(user).toEqual(updatedUser);
    expect(redis.del).toHaveBeenCalledWith("users:email:old@x.com");
    expect(redis.set).toHaveBeenCalledWith(
      "users:email:new@x.com",
      "user-1",
      "EX",
      120
    );
  });
});
