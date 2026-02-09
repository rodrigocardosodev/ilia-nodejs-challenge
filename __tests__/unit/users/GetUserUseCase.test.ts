import { GetUserUseCase } from "../../../src/users/application/use-cases/GetUserUseCase";

describe("GetUserUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("retorna usuário quando encontrado", async () => {
    const user = {
      id: "user-1",
      name: "Ana",
      email: "a@a.com",
      password: "hash",
      createdAt: new Date()
    };
    const userRepository = { findById: jest.fn().mockResolvedValue(user) };
    const logger = makeLogger();
    const useCase = new GetUserUseCase(userRepository as any, logger as any);

    const result = await useCase.execute("user-1");

    expect(result).toBe(user);
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const userRepository = { findById: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new GetUserUseCase(userRepository as any, logger as any);

    await expect(useCase.execute("user-1")).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });
});
