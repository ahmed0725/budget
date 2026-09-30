/**
 * Application errors. Messages are written for end users: they explain what went
 * wrong and what to do next (never "Something went wrong").
 */
export class AppError extends Error {
  readonly code: string;
  readonly details: string[];
  readonly status: number;

  constructor(code: string, message: string, options: { details?: string[]; status?: number } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = options.details ?? [];
    this.status = options.status ?? 400;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Your session has expired. Please sign in again.") {
    super("UNAUTHENTICATED", message, { status: 401 });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message, { status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(what = "record") {
    super("NOT_FOUND", `The requested ${what} was not found or you do not have access to it.`, { status: 404 });
  }
}

export class ValidationFailedError extends AppError {
  readonly fieldErrors: Record<string, string[]>;
  constructor(message: string, fieldErrors: Record<string, string[]> = {}, details: string[] = []) {
    super("VALIDATION_FAILED", message, { details, status: 422 });
    this.fieldErrors = fieldErrors;
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details: string[] = []) {
    super("BUSINESS_RULE", message, { details, status: 409 });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a few minutes and try again.") {
    super("RATE_LIMITED", message, { status: 429 });
  }
}

export interface ActionErrorPayload {
  code: string;
  message: string;
  details: string[];
  fieldErrors?: Record<string, string[]>;
}

/** Translate any thrown value into a safe, user-facing payload. */
export function toErrorPayload(err: unknown): ActionErrorPayload {
  if (err instanceof ValidationFailedError) {
    return { code: err.code, message: err.message, details: err.details, fieldErrors: err.fieldErrors };
  }
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  const pg = extractDatabaseMessage(err);
  if (pg) return { code: "DATABASE_RULE", message: pg, details: [] };
  console.error(err);
  return {
    code: "INTERNAL",
    message: "The server could not complete the request. The error has been logged; please try again or contact the system administrator.",
    details: [],
  };
}

/** Surface integrity-trigger and constraint messages (e.g. locked approved budgets) to users. */
function extractDatabaseMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const text = String((err as { message?: string }).message ?? "");
  if (/is approved and locked|is immutable|cannot be unlocked|cannot be deleted|append-only/i.test(text)) {
    const match = text.match(/(Budget submission[^\n"]*|Approved budget submission[^\n"]*|Table [^\n"]*append-only[^\n"]*)/);
    return match ? match[1] : "This record is protected and cannot be changed.";
  }
  const code = (err as { code?: string }).code;
  if (code === "P2002" || /Unique constraint/i.test(text)) {
    return "A record with the same key already exists. Use a different code or edit the existing record.";
  }
  if (code === "P2003" || /Foreign key constraint/i.test(text)) {
    return "This record is referenced by other data and cannot be removed. Deactivate it instead.";
  }
  if (/violates check constraint/i.test(text)) {
    return "One of the values is outside the allowed range (for example a negative amount).";
  }
  return null;
}
