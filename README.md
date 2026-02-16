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

## Migrations (Postgres)
Para aplicar as migrations do wallet:

```bash
npm run migrate:up
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
Endpoints de escrita exigem também o header `Idempotency-Key` não vazio. Quando ausente/inválido, a API retorna `422` com código `IDEMPOTENCY_KEY_REQUIRED`.

Wallet:
- `POST /transactions`
  - header obrigatório: `Idempotency-Key: <string>`
  - body: `{ "type": "CREDIT" | "DEBIT", "amount": string }`
- `GET /wallet/balance`
  - response: `{ "balanceCents": number }`

Users:
- `POST /users`
  - header obrigatório: `Idempotency-Key: <string>`
  - body: `{ "name": string, "email": string }`
- `PATCH /users/:id`
  - header obrigatório: `Idempotency-Key: <string>`
- `DELETE /users/:id`
  - header obrigatório: `Idempotency-Key: <string>`
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

    Client->>UsersAPI: POST /users (first_name,last_name,email,password)
    UsersAPI->>RegisterUseCase: execute
    RegisterUseCase->>UsersRepo: findByEmail
    UsersRepo->>Redis: get users:email
    alt cache hit
        Redis-->>UsersRepo: userId
        UsersRepo->>MongoDB: findById(userId)
        MongoDB-->>UsersRepo: user | null
    else cache miss
        UsersRepo->>MongoDB: findOne(email)
        MongoDB-->>UsersRepo: user | null
    end
    alt user existe
        RegisterUseCase-->>UsersAPI: user (created=false)
        UsersAPI-->>Client: 201 created
    else novo usuario
        RegisterUseCase->>PasswordHasher: hash password
        RegisterUseCase->>UsersRepo: create user
        UsersRepo->>MongoDB: insert
        MongoDB-->>UsersRepo: ok
        UsersRepo->>Redis: set users:id + users:email
        RegisterUseCase->>Kafka: publish users.created
        RegisterUseCase-->>UsersAPI: user (created=true)
        UsersAPI-->>Client: 201 created
    end
```

### Login (`POST /auth`)
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

    Client->>UsersAPI: POST /auth (email,password)
    UsersAPI->>AuthUseCase: execute
    AuthUseCase->>UsersRepo: findByEmail
    UsersRepo->>Redis: get users:email
    alt cache hit
        Redis-->>UsersRepo: userId
        UsersRepo->>MongoDB: findById(userId)
        MongoDB-->>UsersRepo: user | null
    else cache miss
        UsersRepo->>MongoDB: findOne(email)
        MongoDB-->>UsersRepo: user | null
        UsersRepo->>Redis: set users:id + users:email
    end
    alt credenciais invalidas
        AuthUseCase-->>UsersAPI: error UNAUTHORIZED
        UsersAPI-->>Client: 401 Invalid credentials
    else ok
        AuthUseCase->>PasswordHasher: compare password
        PasswordHasher-->>AuthUseCase: valid
        UsersAPI->>JWT: sign
        UsersAPI-->>Client: 200 token + user
    end
```

### Consulta de usuario por id (`GET /users/:id`)
```mermaid
sequenceDiagram
    participant Client
    participant UsersAPI
    participant Auth
    participant GetUserUseCase
    participant UsersRepo
    participant Redis
    participant MongoDB

    Client->>UsersAPI: GET /users/:id (JWT)
    UsersAPI->>Auth: validate JWT
    Auth-->>UsersAPI: userId
    UsersAPI->>UsersAPI: validate ownership
    UsersAPI->>GetUserUseCase: execute(userId)
    GetUserUseCase->>UsersRepo: findById
    UsersRepo->>Redis: get users:id
    alt cache hit
        Redis-->>UsersRepo: user
        UsersRepo-->>GetUserUseCase: user
    else cache miss
        UsersRepo->>MongoDB: findById
        MongoDB-->>UsersRepo: user | null
        UsersRepo->>Redis: set users:id
        UsersRepo-->>GetUserUseCase: user | null
    end
    alt not found
        GetUserUseCase-->>UsersAPI: error NOT_FOUND
        UsersAPI-->>Client: 404 User not found
    else found
        UsersAPI-->>Client: 200 user
    end
```

### Transacao na carteira (`POST /wallet/transactions`)
```mermaid
sequenceDiagram
    participant Client
    participant WalletAPI
    participant Auth
    participant CreateTransactionUseCase
    participant WalletRepo
    participant Redis
    participant Postgres
    participant Kafka

    Client->>WalletAPI: POST /wallet/transactions (type,amount, Idempotency-Key, JWT)
    WalletAPI->>Auth: validate JWT
    Auth-->>WalletAPI: walletId
    WalletAPI->>CreateTransactionUseCase: execute
    CreateTransactionUseCase->>WalletRepo: findSagaByIdempotencyKey
    alt saga completed
        WalletRepo-->>CreateTransactionUseCase: saga completed
        CreateTransactionUseCase->>WalletRepo: applyTransaction
        WalletRepo->>Postgres: apply transaction
        WalletRepo->>Redis: set balance cache
        CreateTransactionUseCase-->>WalletAPI: result
        WalletAPI-->>Client: 201 created
    else saga pending
        CreateTransactionUseCase-->>WalletAPI: 409 conflict
    else nova saga
        CreateTransactionUseCase->>WalletRepo: createSaga pending
        CreateTransactionUseCase->>WalletRepo: applyTransaction
        WalletRepo->>Postgres: apply transaction
        alt saldo insuficiente
            CreateTransactionUseCase-->>WalletAPI: 422 Insufficient funds
        else ok
            WalletRepo->>Redis: set balance cache
            CreateTransactionUseCase->>WalletRepo: updateSaga publish_event
            CreateTransactionUseCase->>Kafka: publish wallet.transaction.created
            CreateTransactionUseCase->>WalletRepo: updateSaga completed
            CreateTransactionUseCase-->>WalletAPI: result
            WalletAPI-->>Client: 201 created
        end
    end
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
    WalletAPI->>WalletUseCase: getBalance
    WalletUseCase->>WalletRepo: getBalance
    WalletRepo->>Redis: get wallet:balance
    alt cache hit
        Redis-->>WalletRepo: balance
    else cache miss
        WalletRepo->>Postgres: select balance
        Postgres-->>WalletRepo: balance | 0
        WalletRepo->>Redis: set wallet:balance
    end
    WalletUseCase-->>WalletAPI: balance
    WalletAPI-->>Client: 200 amount
```

### Evento `users.created` -> criacao da wallet (Kafka)
```mermaid
sequenceDiagram
    participant UsersService
    participant Kafka
    participant WalletKafkaConsumer
    participant InternalAuth
    participant EnsureWalletUseCase
    participant WalletRepo
    participant Postgres
    participant DLQ

    UsersService->>Kafka: publish users.created (x-internal-jwt)
    Kafka-->>WalletKafkaConsumer: users.created
    WalletKafkaConsumer->>InternalAuth: verify internal jwt
    alt invalid token
        WalletKafkaConsumer->>DLQ: send users.created.dlq
    else ok
        WalletKafkaConsumer->>EnsureWalletUseCase: ensureWallet(userId)
        EnsureWalletUseCase->>WalletRepo: ensureWallet
        WalletRepo->>Postgres: insert wallet if not exists
        Postgres-->>WalletRepo: ok
    end
```

### Evento `wallet.transaction.created` -> atualizacao no Users (Kafka)
```mermaid
sequenceDiagram
    participant WalletService
    participant Kafka
    participant UsersKafkaConsumer
    participant InternalAuth
    participant RecordWalletEventUseCase
    participant WalletEventRepo
    participant Redis
    participant DLQ

    WalletService->>Kafka: publish wallet.transaction.created (topic wallet.transactions)
    Kafka-->>UsersKafkaConsumer: wallet.transactions
    UsersKafkaConsumer->>InternalAuth: verify internal jwt
    alt invalid token
        UsersKafkaConsumer->>DLQ: send wallet.transactions.dlq
    else ok
        UsersKafkaConsumer->>RecordWalletEventUseCase: execute(walletId, transactionId, occurredAt)
        RecordWalletEventUseCase->>WalletEventRepo: recordLatestTransaction
        WalletEventRepo->>Redis: set users:last-wallet-tx
        Redis-->>WalletEventRepo: ok
    end
```

## Kafka
Tópicos usados:
- `users.created`
- `wallet.transactions`
- `users.created.dlq`
- `wallet.transactions.dlq`
