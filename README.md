# ília - Code Challenge NodeJS
**English**
##### Before we start ⚠️
**Please create a fork from this repository**

## The Challenge:
One of the ília Digital verticals is Financial and to level your knowledge we will do a Basic Financial Application and for that we divided this Challenge in 2 Parts.

The first part is mandatory, which is to create a Wallet microservice to store the users' transactions, the second part is optional (*for Seniors, it's mandatory*) which is to create a Users Microservice with integration between the two microservices (Wallet and Users), using internal communications between them, that can be done in any of the following strategies: gRPC, REST, Kafka or via Messaging Queues and this communication must have a different security of the external application (JWT, SSL, ...), **Development in javascript (Node) is required.**

![diagram](diagram.png)

### General Instructions:
## Part 1 - Wallet Microservice

This microservice must be a digital Wallet where the user transactions will be stored 

### The Application must have

    - Project setup documentation (readme.md).
    - Application and Database running on a container (Docker, ...).
    - This Microservice must receive HTTP Request.
    - Have a dedicated database (Postgres, MySQL, Mongo, DynamoDB, ...).
    - JWT authentication on all routes (endpoints) the PrivateKey must be ILIACHALLENGE (passed by env var).
    - Configure the Microservice port to 3001. 
    - Gitflow applied with Code Review in each step, open a feature/branch, create at least one pull request and merge it with Main(master deprecated), this step is important to simulate a team work and not just a commit.

## Part 2 - Microservice Users and Wallet Integration

### The Application must have:

    - Project setup documentation (readme.md).
    - Application and Database running on a container (Docker, ...).
    - This Microservice must receive HTTP Request.   
    - Have a dedicated database(Postgres, MySQL, Mongo, DynamoDB...), you may use an Auth service like AWS Cognito.
    - JWT authentication on all routes (endpoints) the PrivateKey must be ILIACHALLENGE (passed by env var).
    - Set the Microservice port to 3002. 
    - Gitflow applied with Code Review in each step, open a feature/branch, create at least one pull request and merge it with Main(master deprecated), this step is important to simulate a teamwork and not just a commit.
    - Internal Communication Security (JWT, SSL, ...), if it is JWT the PrivateKey must be ILIACHALLENGE_INTERNAL (passed by env var).
    - Communication between Microservices using any of the following: gRPC, REST, Kafka or via Messaging Queues (update your readme with the instructions to run if using a Docker/Container environment).

#### In the end, send us your fork repo updated. As soon as you finish, please let us know.

#### We are available to answer any questions.


Happy coding! 🤓

## Projeto
Este repositório implementa dois microsserviços em Node.js com TypeScript seguindo clean architecture:
- `src/wallet` (porta 3001) com PostgreSQL
- `src/users` (porta 3002) com MongoDB

A comunicação interna é feita via Kafka e ambos usam Redis para cache.

## Como executar localmente
Pré-requisitos: Docker e Docker Compose.

```bash
docker-compose up --build
```

## Variáveis de ambiente
As variáveis abaixo já estão definidas no `docker-compose.yml` e podem ser ajustadas conforme necessário:

Wallet:
- `PORT`
- `JWT_PRIVATE_KEY`
- `INTERNAL_JWT_PRIVATE_KEY`
- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DATABASE`
- `REDIS_URL`
- `KAFKA_BROKERS`

Users:
- `PORT`
- `JWT_PRIVATE_KEY`
- `INTERNAL_JWT_PRIVATE_KEY`
- `MONGO_URI`
- `REDIS_URL`
- `KAFKA_BROKERS`

## Endpoints
Todos os endpoints exigem JWT no header `Authorization: Bearer <token>`.

Wallet:
- `POST /wallet/transactions`
  - body: `{ "type": "credit" | "debit", "amountCents": number, "idempotencyKey": string }`
- `GET /wallet/balance`
  - response: `{ "balanceCents": number }`

Users:
- `POST /users`
  - body: `{ "name": string, "email": string }`
- `GET /users/me`

Health checks:
- `GET /health`
- `GET /ready`

## Diagramas de sequência

### Cadastro de usuário (`POST /users`)
```mermaid
sequenceDiagram
    participant Client
    participant UsersAPI
    participant RegisterUseCase
    participant UsersRepo
    participant Redis
    participant MongoDB
    participant PasswordHasher
    participant Kafka

    Client->>UsersAPI: POST /users (name,email,password)
    UsersAPI->>RegisterUseCase: execute(name,email,password)
    RegisterUseCase->>UsersRepo: findByEmail(email)
    UsersRepo->>Redis: get users:email
    alt cache hit
        Redis-->>UsersRepo: userId
        UsersRepo->>Redis: get users:id
        Redis-->>UsersRepo: user
    else cache miss
        UsersRepo->>MongoDB: findOne(email)
        MongoDB-->>UsersRepo: user | null
        UsersRepo->>Redis: set cache (se user)
    end
    alt user existe
        RegisterUseCase-->>UsersAPI: user (created=false)
        UsersAPI-->>Client: 200 ok
    else novo usuário
        RegisterUseCase->>PasswordHasher: hash(password)
        RegisterUseCase->>UsersRepo: create(user)
        UsersRepo->>MongoDB: insert
        MongoDB-->>UsersRepo: ok
        UsersRepo->>Redis: set user + email
        RegisterUseCase->>Kafka: publish users.created
        RegisterUseCase-->>UsersAPI: user (created=true)
        UsersAPI-->>Client: 201 created
    end
```

### Login (`POST /login`)
```mermaid
sequenceDiagram
    participant Client
    participant UsersAPI
    participant AuthUseCase
    participant UsersRepo
    participant Redis
    participant MongoDB
    participant PasswordHasher
    participant JWT

    Client->>UsersAPI: POST /login (email,password)
    UsersAPI->>AuthUseCase: execute(email,password)
    AuthUseCase->>UsersRepo: findByEmail(email)
    UsersRepo->>Redis: get users:email
    alt cache hit
        Redis-->>UsersRepo: userId
        UsersRepo->>Redis: get users:id
        Redis-->>UsersRepo: user
    else cache miss
        UsersRepo->>MongoDB: findOne(email)
        MongoDB-->>UsersRepo: user | null
        UsersRepo->>Redis: set cache (se user)
    end
    alt credenciais inválidas
        AuthUseCase-->>UsersAPI: error UNAUTHORIZED
        UsersAPI-->>Client: 401 Invalid credentials
    else ok
        AuthUseCase->>PasswordHasher: compare(password, hash)
        PasswordHasher-->>AuthUseCase: valid
        UsersAPI->>JWT: sign(sub=userId, exp=1h)
        UsersAPI-->>Client: 200 token + user
    end
```

### Consulta do próprio usuário (`GET /users/me`)
```mermaid
sequenceDiagram
    participant Client
    participant UsersAPI
    participant Auth
    participant UsersUseCase
    participant UsersRepo
    participant Redis
    participant MongoDB

    Client->>UsersAPI: GET /users/me (JWT)
    UsersAPI->>Auth: validate JWT
    Auth-->>UsersAPI: userId
    UsersAPI->>UsersUseCase: getUser(userId)
    UsersUseCase->>UsersRepo: findById(userId)
    UsersRepo->>Redis: get cache
    alt cache hit
        Redis-->>UsersRepo: user
        UsersRepo-->>UsersUseCase: user
    else cache miss
        UsersRepo->>MongoDB: findById
        MongoDB-->>UsersRepo: user | null
        UsersRepo->>Redis: set cache (if user)
        UsersRepo-->>UsersUseCase: user | null
    end
    alt not found
        UsersUseCase-->>UsersAPI: error NOT_FOUND
        UsersAPI-->>Client: 404 User not found
    else found
        UsersAPI-->>Client: 200 user
    end
```

### Transação na carteira (`POST /wallet/transactions`)
```mermaid
sequenceDiagram
    participant Client
    participant WalletAPI
    participant Auth
    participant WalletUseCase
    participant WalletRepo
    participant Redis
    participant Postgres
    participant Kafka

    Client->>WalletAPI: POST /wallet/transactions (type,amountCents,idempotencyKey, JWT)
    WalletAPI->>Auth: validate JWT
    Auth-->>WalletAPI: walletId
    WalletAPI->>WalletUseCase: createTransaction(...)
    WalletUseCase->>WalletRepo: applyTransaction(...)
    WalletRepo->>Postgres: BEGIN
    WalletRepo->>Postgres: ensure wallet
    WalletRepo->>Postgres: check idempotency
    alt já processada
        WalletRepo->>Postgres: get balance
        WalletRepo->>Postgres: COMMIT
        WalletRepo-->>WalletUseCase: result
    else nova transação
        WalletRepo->>Postgres: lock wallet row
        WalletRepo->>Postgres: insert transaction
        WalletRepo->>Postgres: update balance
        alt saldo insuficiente
            WalletRepo->>Postgres: ROLLBACK
            WalletUseCase-->>WalletAPI: error INSUFFICIENT_FUNDS
            WalletAPI-->>Client: 422 Insufficient funds
        else ok
            WalletRepo->>Postgres: COMMIT
            WalletRepo->>Redis: update balance cache
            WalletRepo-->>WalletUseCase: result
        end
    end
    WalletUseCase->>Kafka: publish wallet.transaction.created (topic wallet.transactions)
    WalletUseCase-->>WalletAPI: result
    WalletAPI-->>Client: 201 created
```

### Consulta de saldo (`GET /wallet/balance`)
```mermaid
sequenceDiagram
    participant Client
    participant WalletAPI
    participant Auth
    participant WalletUseCase
    participant WalletRepo
    participant Redis
    participant Postgres

    Client->>WalletAPI: GET /wallet/balance (JWT)
    WalletAPI->>Auth: validate JWT
    Auth-->>WalletAPI: walletId
    WalletAPI->>WalletUseCase: getBalance(walletId)
    WalletUseCase->>WalletRepo: getBalance(walletId)
    WalletRepo->>Redis: get cache
    alt cache hit
        Redis-->>WalletRepo: balance
    else cache miss
        WalletRepo->>Postgres: select balance
        Postgres-->>WalletRepo: balance | 0
        WalletRepo->>Redis: set cache
    end
    WalletUseCase-->>WalletAPI: balance
    WalletAPI-->>Client: 200 balanceCents
```

### Evento `users.created` -> criação da wallet (Kafka)
```mermaid
sequenceDiagram
    participant UsersService
    participant Kafka
    participant WalletConsumer
    participant InternalAuth
    participant EnsureWalletUseCase
    participant WalletRepo
    participant Postgres

    UsersService->>Kafka: publish users.created (x-internal-jwt)
    Kafka-->>WalletConsumer: users.created
    WalletConsumer->>InternalAuth: verify internal jwt
    InternalAuth-->>WalletConsumer: ok
    WalletConsumer->>EnsureWalletUseCase: ensureWallet(userId)
    EnsureWalletUseCase->>WalletRepo: ensureWallet(userId)
    WalletRepo->>Postgres: insert wallet if not exists
    Postgres-->>WalletRepo: ok
```

### Evento `wallet.transaction.created` -> atualização no Users (Kafka)
```mermaid
sequenceDiagram
    participant WalletService
    participant Kafka
    participant UsersConsumer
    participant InternalAuth
    participant RecordWalletEventUseCase
    participant WalletEventRepo
    participant Redis

    WalletService->>Kafka: publish wallet.transaction.created (topic wallet.transactions)
    Kafka-->>UsersConsumer: wallet.transactions
    UsersConsumer->>InternalAuth: verify internal jwt
    InternalAuth-->>UsersConsumer: ok
    UsersConsumer->>RecordWalletEventUseCase: recordLatestTransaction(userId, txId, occurredAt)
    RecordWalletEventUseCase->>WalletEventRepo: recordLatestTransaction(...)
    WalletEventRepo->>Redis: set last wallet tx
    Redis-->>WalletEventRepo: ok
```

## Kafka
Tópicos usados:
- `users.created`
- `wallet.transactions`
- `users.created.dlq`
- `wallet.transactions.dlq`
