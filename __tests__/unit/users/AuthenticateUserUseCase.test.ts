import { AuthenticateUserUseCase } from "../../../src/users/application/use-cases/AuthenticateUserUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("AuthenticateUserUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("retorna erro quando usuário não existe", async () => {
    const userRepository = { findByEmail: jest.fn().mockResolvedValue(null) };
    const passwordHasher = { compare: jest.fn() };
    const logger = makeLogger();

    const useCase = new AuthenticateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({ email: "a@a.com", password: "x" })
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Invalid credentials"));
  });

  it("retorna erro quando senha inválida", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: "user-1",
        name: "Ana",
        email: "a@a.com",
        password: "hash",
        createdAt: new Date()
      })
    };
    const passwordHasher = { compare: jest.fn().mockResolvedValue(false) };
    const logger = makeLogger();

    const useCase = new AuthenticateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({ email: "a@a.com", password: "x" })
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Invalid credentials"));
  });

  it("retorna usuário quando credenciais válidas", async () => {
    const user = {
      id: "user-1",
      name: "Ana",
      email: "a@a.com",
      password: "hash",
      createdAt: new Date()
    };
    const userRepository = { findByEmail: jest.fn().mockResolvedValue(user) };
    const passwordHasher = { compare: jest.fn().mockResolvedValue(true) };
    const logger = makeLogger();

    const useCase = new AuthenticateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute({ email: "a@a.com", password: "x" });

    expect(result).toBe(user);
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const userRepository = { findByEmail: jest.fn().mockRejectedValue(error) };
    const passwordHasher = { compare: jest.fn() };
    const logger = makeLogger();

    const useCase = new AuthenticateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({ email: "a@a.com", password: "x" })
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it("propaga erro quando compare falha", async () => {
    const error = new Error("compare");
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: "user-1",
        name: "Ana",
        email: "a@a.com",
        password: "hash",
        createdAt: new Date()
      })
    };
    const passwordHasher = { compare: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();

    const useCase = new AuthenticateUserUseCase(
      userRepository as any,
      passwordHasher as any,
      logger as any
    );

    await expect(
      useCase.execute({ email: "a@a.com", password: "x" })
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });
});
