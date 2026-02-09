import { DeleteUserUseCase } from "../../../src/users/application/use-cases/DeleteUserUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("DeleteUserUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("remove usuário quando existe", async () => {
    const userRepository = { deleteById: jest.fn().mockResolvedValue(true) };
    const logger = makeLogger();
    const useCase = new DeleteUserUseCase(userRepository as any, logger as any);

    await useCase.execute("user-1");

    expect(userRepository.deleteById).toHaveBeenCalledWith("user-1");
  });

  it("retorna erro quando usuário não existe", async () => {
    const userRepository = { deleteById: jest.fn().mockResolvedValue(false) };
    const logger = makeLogger();
    const useCase = new DeleteUserUseCase(userRepository as any, logger as any);

    await expect(useCase.execute("user-1")).rejects.toEqual(
      new AppError("NOT_FOUND", 404, "User not found")
    );
  });

  it("propaga erro do repositório", async () => {
    const error = new Error("db");
    const userRepository = { deleteById: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new DeleteUserUseCase(userRepository as any, logger as any);

    await expect(useCase.execute("user-1")).rejects.toBe(error);
  });
});
