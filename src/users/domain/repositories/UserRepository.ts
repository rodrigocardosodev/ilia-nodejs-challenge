import { User } from "../entities/User";

export type CreateUserInput = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  updateById(id: string, input: Omit<CreateUserInput, "id">): Promise<User | null>;
  deleteById(id: string): Promise<boolean>;
}
