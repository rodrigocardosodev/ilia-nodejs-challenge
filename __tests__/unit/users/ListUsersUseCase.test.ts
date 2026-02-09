import { ListUsersUseCase } from "../../../src/users/application/use-cases/ListUsersUseCase";

describe("ListUsersUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("retorna lista de usuários", async () => {
    const users = [
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        password: "hash",
        createdAt: new Date()
      }
    ];
    const userRepository = { findAll: jest.fn().mockResolvedValue(users) };
    const logger = makeLogger();
    const useCase = new ListUsersUseCase(userRepository as any, logger as any);

    const result = await useCase.execute();

    expect(result).toBe(users);
    expect(userRepository.findAll).toHaveBeenCalled();
  });

  it("propaga erro do repositório", async () => {
    const error = new Error("db");
    const userRepository = { findAll: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new ListUsersUseCase(userRepository as any, logger as any);

    await expect(useCase.execute()).rejects.toBe(error);
  });
});
