import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: false,
};

/** Returns a list of unmet requirements (empty = acceptable). */
export function checkPasswordPolicy(password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string[] {
  const problems: string[] = [];
  if (password.length < policy.minLength) problems.push(`at least ${policy.minLength} characters`);
  if (policy.requireUpper && !/[A-Z]/.test(password)) problems.push("an uppercase letter");
  if (policy.requireLower && !/[a-z]/.test(password)) problems.push("a lowercase letter");
  if (policy.requireDigit && !/\d/.test(password)) problems.push("a digit");
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) problems.push("a symbol");
  return problems;
}
