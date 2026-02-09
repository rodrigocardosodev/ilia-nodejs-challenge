import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/src/.*/infrastructure/",
    "/src/.*/index.ts",
    "/src/shared/observability/",
    "/src/shared/http/healthRoutes.ts",
    "/src/shared/http/requestLoggerMiddleware.ts",
    "/src/shared/http/traceMiddleware.ts"
  ],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.test.json"
    }
  },
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  }
};

export default config;
