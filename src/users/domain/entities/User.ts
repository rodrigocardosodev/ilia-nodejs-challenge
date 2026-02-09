export type UserId = string;

export class User {
  constructor(
    public readonly id: UserId,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly password: string,
    public readonly createdAt: Date
  ) {}
}
