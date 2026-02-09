import { UsersController } from "../../../src/users/interfaces/http/UsersController";
import { AppError } from "../../../src/shared/http/AppError";

describe("UsersController", () => {
  const makeController = (user: any, list: any[] = [user]) => {
    const registerUserUseCase = { execute: jest.fn().mockResolvedValue(user) };
    const getUserUseCase = { execute: jest.fn().mockResolvedValue(user) };
    const authenticateUserUseCase = { execute: jest.fn().mockResolvedValue(user) };
    const listUsersUseCase = { execute: jest.fn().mockResolvedValue(list) };
    const updateUserUseCase = { execute: jest.fn().mockResolvedValue(user) };
    const deleteUserUseCase = { execute: jest.fn().mockResolvedValue(undefined) };
    return new UsersController(
      registerUserUseCase as any,
      getUserUseCase as any,
      authenticateUserUseCase as any,
      listUsersUseCase as any,
      updateUserUseCase as any,
      deleteUserUseCase as any,
      "secret"
    );
  };

  const res = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  it("valida body do registro", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.register({ body: { email: "a@a.com" } } as any, res() as any)
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("retorna 200 quando usuário já existe", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: false
    });
    const response = res();

    await controller.register(
      {
        body: {
          first_name: "Ana",
          last_name: "Silva",
          email: "a@a.com",
          password: "secret123"
        }
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("valida body do login", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.login({ body: { email: "a@a.com" } } as any, res() as any)
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("valida id no getById", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.getById({ params: { id: "" } } as any, res() as any)
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("lista usuários", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });
    const response = res();

    await controller.list({} as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([
      {
        id: "u1",
        first_name: "Ana",
        last_name: "Silva",
        email: "a@a.com"
      }
    ]);
  });

  it("retorna usuário no getById", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });
    const response = res();

    await controller.getById({ params: { id: "u1" } } as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      id: "u1",
      first_name: "Ana",
      last_name: "Silva",
      email: "a@a.com"
    });
  });

  it("valida body no update", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.update(
        { params: { id: "u1" }, body: { email: "a@a.com" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("valida id no update", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.update(
        { params: { id: ["u1"] }, body: {} } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("atualiza usuário", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });
    const response = res();

    await controller.update(
      {
        params: { id: "u1" },
        body: {
          first_name: "Ana",
          last_name: "Silva",
          email: "a@a.com",
          password: "secret123"
        }
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("remove usuário", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });
    const response = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.remove({ params: { id: "u1" } } as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("valida id no remove", async () => {
    const controller = makeController({
      id: "u1",
      firstName: "Ana",
      lastName: "Silva",
      email: "a@a.com",
      createdAt: new Date(),
      created: true
    });

    await expect(
      controller.remove({ params: { id: ["u1"] } } as any, res() as any)
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("retorna erro quando usuário não encontrado", async () => {
    const registerUserUseCase = { execute: jest.fn() };
    const getUserUseCase = { execute: jest.fn().mockResolvedValue(null) };
    const authenticateUserUseCase = { execute: jest.fn() };
    const listUsersUseCase = { execute: jest.fn() };
    const updateUserUseCase = { execute: jest.fn() };
    const deleteUserUseCase = { execute: jest.fn() };
    const controller = new UsersController(
      registerUserUseCase as any,
      getUserUseCase as any,
      authenticateUserUseCase as any,
      listUsersUseCase as any,
      updateUserUseCase as any,
      deleteUserUseCase as any,
      "secret"
    );

    await expect(
      controller.getById({ params: { id: "u1" } } as any, res() as any)
    ).rejects.toEqual(new AppError("NOT_FOUND", 404, "User not found"));
  });
});
