export const MONEY_SCALE = 4;

const MONEY_REGEX = /^-?\d+(?:\.\d{1,4})?$/;
const MONEY_FACTOR = 10n ** BigInt(MONEY_SCALE);

export class MoneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyValidationError";
  }
}

export const normalizeMoney = (value: string): string => {
  if (!MONEY_REGEX.test(value)) {
    throw new MoneyValidationError("Invalid money format");
  }

  const [integerPart, decimalPart = ""] = value.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedDecimal = decimalPart.padEnd(MONEY_SCALE, "0");
  return `${normalizedInteger}.${normalizedDecimal}`;
};

export const moneyToScaled = (value: string): bigint => {
  const normalized = normalizeMoney(value);
  const [integerPart, decimalPart] = normalized.split(".");
  return BigInt(integerPart) * MONEY_FACTOR + BigInt(decimalPart);
};

export const moneyFromScaled = (value: bigint): string => {
  const negative = value < 0n;
  const absoluteValue = negative ? -value : value;
  const integerPart = absoluteValue / MONEY_FACTOR;
  const decimalPart = absoluteValue % MONEY_FACTOR;
  const normalized = `${integerPart.toString()}.${decimalPart.toString().padStart(MONEY_SCALE, "0")}`;
  return negative ? `-${normalized}` : normalized;
};

export const compareMoney = (left: string, right: string): number => {
  const leftScaled = moneyToScaled(left);
  const rightScaled = moneyToScaled(right);
  if (leftScaled === rightScaled) {
    return 0;
  }
  return leftScaled > rightScaled ? 1 : -1;
};

export const addMoney = (left: string, right: string): string => {
  return moneyFromScaled(moneyToScaled(left) + moneyToScaled(right));
};

export const subtractMoney = (left: string, right: string): string => {
  return moneyFromScaled(moneyToScaled(left) - moneyToScaled(right));
};

export const isPositiveMoney = (value: string): boolean => {
  return compareMoney(value, "0.0000") === 1;
};
