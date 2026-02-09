import { compare, hash } from "bcryptjs";
import { PasswordHasher } from "../../application/ports/PasswordHasher";

export class BcryptPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        return hash(password, 8);
    }

    async compare(password: string, hash: string): Promise<boolean> {
        return compare(password, hash);
    }
}
