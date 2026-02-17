import express from "express";
import request from "supertest";
import { UsersController } from "../../src/users/interfaces/http/UsersController";
import { buildUsersRoutes } from "../../src/users/interfaces/http/routes";
import { createErrorMiddleware } from "../../src/shared/http/errorMiddleware";
import { createRateLimiters, RouteRateLimiters } from "../../src/shared/http/rateLimitMiddleware";
import { AppError } from "../../src/shared/http/AppError";

describe("users routes", () => {
  const jwtKey = "secret";
  const metrics = { recordAuthFailure: jest.fn() };
  const logger = { error: jest.fn(), info: jest.fn() };

  const buildApp = (
    registerResult: any,
    authUser: any,
    meUser: any,
    rateLimiters?: Partial<RouteRateLimiters>
  ) => {
    const registerUserUseCase = { execute: jest.fn().mockResolvedValue(registerResult) };
    const authenticateUserUseCase = { execute: jest.fn().mockResolvedValue(authUser) };
    const getUserUseCase = { execute: jest.fn().mockResolvedValue(meUser) };
    const listUsersUseCase = { execute: jest.fn().mockResolvedValue([meUser]) };
    const updateUserUseCase = { execute: jest.fn().mockResolvedValue(meUser) };
    const deleteUserUseCase = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new UsersController(
      registerUserUseCase as any,
      getUserUseCase as any,
      authenticateUserUseCase as any,
      listUsersUseCase as any,
      updateUserUseCase as any,
      deleteUserUseCase as any,
      jwtKey
    );

    const app = express();
    app.use(express.json());
    app.use("/", buildUsersRoutes(controller, { jwtKey, metrics } as any, rateLimiters));
    app.use(createErrorMiddleware(logger as any));
    return app;
  };

  it("valida request de registro", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app)
      .post("/users")
      .set("Idempotency-Key", "idem-register-invalid")
      .send({ email: "a@a.com" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_INPUT");
  });

  it("cria usuário válido", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app)
      .post("/users")
      .set("Idempotency-Key", "idem-register-ok")
      .send({
        first_name: "Ana",
        last_name: "Silva",
        email: "a@a.com",
        password: "secret123"
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("u1");
  });

  it("retorna 422 quando Idempotency-Key está ausente no registro", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app).post("/users").send({
      first_name: "Ana",
      last_name: "Silva",
      email: "a@a.com",
      password: "secret123"
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("retorna token no login", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app)
      .post("/auth")
      .send({ email: "a@a.com", password: "secret123" });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeDefined();
  });

  it("protege rota /users", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app).get("/users");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("rejeita Authorization sem Bearer", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const response = await request(app)
      .get("/users")
      .set("Authorization", "Token invalid");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("retorna usuário no /users/:id com token válido", async () => {
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" }
    );

    const login = await request(app)
      .post("/auth")
      .send({ email: "a@a.com", password: "secret123" });

    const response = await request(app)
      .get("/users/u1")
      .set("Authorization", `Bearer ${login.body.access_token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("u1");
  });

  it("aplica rate limit no /users quando excede limite de escrita", async () => {
    const rateLimiters = createRateLimiters({
      namespace: "test-users-write",
      auth: { windowMs: 60_000, limit: 10 },
      write: { windowMs: 60_000, limit: 1 }
    });
    const app = buildApp(
      {
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      { id: "u1", firstName: "Ana", lastName: "Silva", email: "a@a.com" },
      rateLimiters
    );

    const first = await request(app)
      .post("/users")
      .set("Idempotency-Key", "idem-register-1")
      .send({
        first_name: "Ana",
        last_name: "Silva",
        email: "a@a.com",
        password: "secret123"
      });
    const second = await request(app)
      .post("/users")
      .set("Idempotency-Key", "idem-register-2")
      .send({
        first_name: "Ana",
        last_name: "Silva",
        email: "a2@a.com",
        password: "secret123"
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("aplica rate limit no /auth para falhas consecutivas", async () => {
    const registerUserUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com",
        createdAt: new Date(),
        created: true
      })
    };
    const authenticateUserUseCase = {
      execute: jest.fn().mockRejectedValue(new AppError("UNAUTHORIZED", 401, "Unauthorized"))
    };
    const getUserUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com"
      })
    };
    const listUsersUseCase = { execute: jest.fn().mockResolvedValue([]) };
    const updateUserUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: "u1",
        firstName: "Ana",
        lastName: "Silva",
        email: "a@a.com"
      })
    };
    const deleteUserUseCase = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new UsersController(
      registerUserUseCase as any,
      getUserUseCase as any,
      authenticateUserUseCase as any,
      listUsersUseCase as any,
      updateUserUseCase as any,
      deleteUserUseCase as any,
      jwtKey
    );
    const app = express();
    app.use(express.json());
    app.use(
      "/",
      buildUsersRoutes(
        controller,
        { jwtKey, metrics } as any,
        createRateLimiters({
          namespace: "test-users-auth",
          auth: { windowMs: 60_000, limit: 1 },
          write: { windowMs: 60_000, limit: 10 }
        })
      )
    );
    app.use(createErrorMiddleware(logger as any));

    const first = await request(app).post("/auth").send({ email: "a@a.com", password: "wrong" });
    const second = await request(app).post("/auth").send({ email: "a@a.com", password: "wrong" });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("TOO_MANY_REQUESTS");
  });
});
