import { UpdateUserUseCase } from "../../../src/users/application/use-cases/UpdateUserUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("UpdateUserUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("atualiza usuário quando existe", async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "hash-old",
        createdAt: new Date()
      }),
      findByEmail: jest.fn().mockResolvedValue(null),
      updateById: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "hash",
        createdAt: new Date()
      })
    };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hash") };
    const logger = makeLogger();
    const useCase = new UpdateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      password: "secret"
    });

    expect(result.id).toBe("u1");
    expect(passwordHasher.hash).toHaveBeenCalledWith("secret");
    expect(userRepository.updateById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ email: "a@a.com" })
    );
  });

  it("retorna erro quando usuário não existe", async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn(),
      updateById: jest.fn()
    };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hash") };
    const logger = makeLogger();
    const useCase = new UpdateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "secret"
      })
    ).rejects.toEqual(new AppError("NOT_FOUND", 404, "User not found"));
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it("propaga erro do repositório", async () => {
    const error = new Error("db");
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "hash-old",
        createdAt: new Date()
      }),
      findByEmail: jest.fn().mockResolvedValue(null),
      updateById: jest.fn().mockRejectedValue(error)
    };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hash") };
    const logger = makeLogger();
    const useCase = new UpdateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "secret"
      })
    ).rejects.toBe(error);
  });

  it("propaga erro de conflito do repositório", async () => {
    const error = new AppError("CONFLICT", 409, "Email already in use");
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "hash-old",
        createdAt: new Date()
      }),
      findByEmail: jest.fn().mockResolvedValue({
        id: "u2",
        firstName: "Bia",
        lastName: "Costa",
        email: "used@a.com",
        password: "hash-2",
        createdAt: new Date()
      }),
      updateById: jest.fn().mockResolvedValue(null)
    };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hash") };
    const logger = makeLogger();
    const useCase = new UpdateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "used@a.com",
        password: "secret"
      })
    ).rejects.toEqual(error);
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });
});
