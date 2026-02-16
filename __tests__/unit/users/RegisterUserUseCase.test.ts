jest.mock("crypto", () => ({ randomUUID: () => "uuid-1" }));

import { RegisterUserUseCase } from "../../../src/users/application/use-cases/RegisterUserUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("RegisterUserUseCase", () => {
  const baseInput = {
    id: "user-1",
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@example.com",
    password: "secret123"
  };

  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("reusa usuário existente com mesmo id", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: "user-1",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com",
        password: "hashed",
        createdAt: new Date("2024-01-01")
      }),
      create: jest.fn()
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn() };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute(baseInput);

    expect(result.created).toBe(false);
    expect(result.id).toBe("user-1");
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it("bloqueia email já usado por outro id", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: "user-2",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com",
        password: "hashed",
        createdAt: new Date("2024-01-01")
      }),
      create: jest.fn()
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn() };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    await expect(useCase.execute(baseInput)).rejects.toEqual(
      new AppError("CONFLICT", 409, "Email already in use")
    );
  });

  it("cria novo usuário e publica evento", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "user-1",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com",
        password: "hashed",
        createdAt: new Date("2024-01-02")
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hashed") };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute(baseInput);

    expect(result.created).toBe(true);
    expect(passwordHasher.hash).toHaveBeenCalledWith(baseInput.password);
    expect(userRepository.create).toHaveBeenCalled();
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "users.created",
        payload: expect.objectContaining({
          eventId: "uuid-1",
          userId: "user-1",
          name: "Ana Silva",
          firstName: "Ana",
          lastName: "Silva",
          email: "ana@example.com",
          occurredAt: expect.any(String)
        })
      })
    );
  });

  it("gera id quando não informado", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "uuid-1",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com",
        password: "hashed",
        createdAt: new Date("2024-01-02")
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hashed") };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute({
      firstName: baseInput.firstName,
      lastName: baseInput.lastName,
      email: baseInput.email,
      password: baseInput.password
    } as any);

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "uuid-1" })
    );
    expect(result.id).toBe("uuid-1");
  });

  it("continua quando publicar evento falha", async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "user-1",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com",
        password: "hashed",
        createdAt: new Date("2024-01-02")
      })
    };
    const eventPublisher = { publish: jest.fn().mockRejectedValue(new Error("kafka")) };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hashed") };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    const result = await useCase.execute(baseInput);

    expect(result.created).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it("propaga erro quando hash falha", async () => {
    const error = new Error("hash");
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn()
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    await expect(useCase.execute(baseInput)).rejects.toBe(error);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it("propaga erro quando create falha", async () => {
    const error = new Error("db");
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publish: jest.fn() };
    const passwordHasher = { hash: jest.fn().mockResolvedValue("hashed") };
    const logger = makeLogger();

    const useCase = new RegisterUserUseCase(
      userRepository as any,
      eventPublisher as any,
      passwordHasher as any,
      logger as any
    );

    await expect(useCase.execute(baseInput)).rejects.toBe(error);
  });
});
