import { ApiError } from "@/api/client";
import { logger } from "./logger";

export interface FriendlyError {
  title: string;
  description: string;
  action?: { label: string; href: string };
}

/** Known structured error codes from the backend. */
const ERROR_CODE_MAP: Record<string, FriendlyError> = {
  POLICY_RULE_CONFLICT: {
    title: "Policy rule conflict",
    description: "This rule conflicts with an existing rule. Check rule priorities and matching criteria.",
  },
  BUNDLE_LOCKED: {
    title: "Bundle is locked",
    description: "This bundle is currently locked for editing. Wait for the lock to release or contact the lock owner.",
  },
  WORKFLOW_RUNNING: {
    title: "Workflow is running",
    description: "This workflow has active runs. Stop all runs before making changes.",
  },
  IDEMPOTENCY_CONFLICT: {
    title: "Duplicate request",
    description: "This operation was already submitted. Check the results page for the existing entry.",
  },
  TENANT_MISMATCH: {
    title: "Tenant access denied",
    description: "You don't have access to this tenant's resources. Switch to the correct tenant.",
  },
};

/** HTTP status code to friendly message mapping. */
const STATUS_MAP: Record<number, FriendlyError> = {
  400: {
    title: "Invalid request",
    description: "Check your input for missing or invalid fields and try again.",
  },
  401: {
    title: "Session expired",
    description: "Your session has expired. Please log in again.",
    action: { label: "Log in", href: "/login" },
  },
  403: {
    title: "Permission denied",
    description: "You don't have permission for this action. Contact your admin if you need access.",
  },
  404: {
    title: "Not found",
    description: "The requested resource no longer exists or was moved.",
  },
  409: {
    title: "Conflict",
    description: "This operation conflicts with the current state. Refresh and try again.",
  },
  422: {
    title: "Validation failed",
    description: "The server rejected the input. Check the form fields and try again.",
  },
  429: {
    title: "Too many requests",
    description: "You're sending requests too quickly. Wait a moment and try again.",
  },
  500: {
    title: "Server error",
    description: "Something went wrong on our end. Try again in a moment.",
    action: { label: "Check system health", href: "/settings/health" },
  },
  502: {
    title: "Service unavailable",
    description: "A backend service is not responding. Check the system health page.",
    action: { label: "Check system health", href: "/settings/health" },
  },
  503: {
    title: "Service temporarily unavailable",
    description: "The system is under maintenance or overloaded. Try again shortly.",
    action: { label: "Check system health", href: "/settings/health" },
  },
  504: {
    title: "Request timed out",
    description: "The server took too long to respond. Try again or check system health.",
    action: { label: "Check system health", href: "/settings/health" },
  },
};

/**
 * Translates raw errors into user-friendly messages with recovery actions.
 * Always logs the technical error for debugging.
 */
export function friendlyError(err: unknown, context?: string): FriendlyError {
  const logCtx = context ?? "unknown";

  // ApiError with structured body
  if (err instanceof ApiError) {
    logger.error("api-error", `[${logCtx}] ${err.status}: ${err.message}`, {
      status: err.status,
      body: err.body,
    });

    // Check for structured error code in body
    const body = err.body as Record<string, unknown> | null | undefined;
    if (body?.error && typeof body.error === "string" && ERROR_CODE_MAP[body.error]) {
      return ERROR_CODE_MAP[body.error];
    }

    // Check for validation errors array
    if (body?.errors && Array.isArray(body.errors) && body.errors.length > 0) {
      const fields = body.errors
        .slice(0, 3)
        .map((e: unknown) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object") {
            const obj = e as Record<string, unknown>;
            const field = obj.field ?? obj.path ?? "";
            const msg = obj.message ?? obj.msg ?? "";
            return field ? `${field}: ${msg}` : String(msg);
          }
          return String(e);
        })
        .filter(Boolean);
      const more = body.errors.length > 3 ? ` (+${body.errors.length - 3} more)` : "";
      return {
        title: "Validation failed",
        description: fields.join(". ") + more,
      };
    }

    // Fall back to status code
    if (STATUS_MAP[err.status]) {
      return STATUS_MAP[err.status];
    }

    return {
      title: `Request failed (${err.status})`,
      description: "An unexpected error occurred. Please try again.",
    };
  }

  // Network errors (fetch failures)
  if (err instanceof TypeError && typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("network")) {
      logger.error("network-error", `[${logCtx}] ${err.message}`);
      return {
        title: "Unable to connect",
        description: "Check your network connection and try again.",
      };
    }
  }

  // Timeout errors
  if (err instanceof Error && /timeout|deadline|timed.?out/i.test(err.message)) {
    logger.error("timeout-error", `[${logCtx}] ${err.message}`);
    return {
      title: "Request timed out",
      description: "The server is taking too long. Try again or check system health.",
      action: { label: "Check system health", href: "/settings/health" },
    };
  }

  // Generic Error
  if (err instanceof Error) {
    logger.error("error", `[${logCtx}] ${err.message}`);
  } else {
    logger.error("error", `[${logCtx}] ${String(err)}`);
  }

  return {
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again.",
  };
}
