export type WalletId = string;

export class Wallet {
  constructor(
    public readonly id: WalletId,
    public readonly balance: number,
    public readonly version: number
  ) {}
}
