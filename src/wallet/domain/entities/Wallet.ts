export type WalletId = string;

export class Wallet {
  constructor(
    public readonly id: WalletId,
    public readonly balance: string,
    public readonly version: number
  ) {}
}
