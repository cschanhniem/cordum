import { z } from "zod";
import { logger } from "../../lib/logger";
import type { UnifiedNodeData } from "./types";

// ---------------------------------------------------------------------------
// Per-type Zod schemas
// ---------------------------------------------------------------------------

export const jobSchema = z.object({
  label: z.string().min(1, "Name required"),
  topic: z.string().min(1, "Topic required"),
  capabilities: z.string().optional(),
  timeout: z.string().optional(),
  retryMax: z.coerce.number().int().min(0).optional(),
});

export const approvalSchema = z.object({
  label: z.string().min(1, "Name required"),
  approverRoles: z.string().optional(),
  timeout: z.string().optional(),
});

export const delaySchema = z.object({
  label: z.string().min(1, "Name required"),
  duration: z.string().min(1, "Duration required"),
});

export const conditionSchema = z.object({
  label: z.string().min(1, "Name required"),
  expression: z.string().min(1, "Expression required"),
});

export const notifySchema = z.object({
  label: z.string().min(1, "Name required"),
  channel: z.string().min(1, "Channel required"),
  messageTemplate: z.string().optional(),
});

export const fanOutSchema = z.object({
  label: z.string().min(1, "Name required"),
  forEach: z.string().min(1, "For-each expression required").optional(),
  parallelism: z.coerce.number().int().min(1).optional(),
});

export const parallelSchema = z.object({
  label: z.string().min(1, "Name required"),
  parallelSteps: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.trim()) return [value.trim()];
      return [];
    },
    z.array(z.string()).min(1, "Select at least one child step"),
  ),
  completionStrategy: z.enum(["all", "any", "n_of_m"]),
  requiredCount: z.coerce.number().int().min(1).optional(),
  parallelism: z.coerce.number().int().min(1).optional(),
});

export const httpSchema = z.object({
  label: z.string().min(1, "Name required"),
  method: z.string().min(1, "Method required"),
  url: z.string().min(1, "URL required").refine(
    (v) => !/^(javascript|data):/i.test(v),
    "Invalid URL scheme",
  ),
  headers: z.string().optional(),
  body: z.string().optional(),
  timeout: z.string().optional(),
});

export const transformSchema = z.object({
  label: z.string().min(1, "Name required"),
  expression: z.string().min(1, "Expression required"),
  inputMapping: z.string().optional(),
  outputMapping: z.string().optional(),
});

export const switchSchema = z.object({
  label: z.string().min(1, "Name required"),
  expression: z.string().optional(),
  switchCases: z
    .array(
      z.object({
        matchValue: z.string().optional(),
        stepId: z.string().optional(),
      }),
    )
    .optional(),
  defaultBranch: z.string().optional(),
});

export const loopSchema = z.object({
  label: z.string().min(1, "Name required"),
  bodyStep: z.string().min(1, "Body step required"),
  maxIterations: z.coerce.number().int().min(1).max(10_000).optional(),
  condition: z.string().optional(),
  until: z.string().optional(),
});

export const subWorkflowSchema = z.object({
  label: z.string().min(1, "Name required"),
  workflowId: z.string().min(1, "Workflow ID required"),
  subInputMapping: z.string().optional(),
  subOutputMapping: z.string().optional(),
  outputPath: z.string().optional(),
});

export const storageSchema = z.object({
  label: z.string().min(1, "Name required"),
  operation: z.enum(["read", "write", "delete"]),
  key: z.string().min(1, "Key path required"),
  value: z.string().optional(),
  outputPath: z.string().optional(),
});

export const errorTriggerSchema = z.object({
  label: z.string().min(1, "Name required"),
  catchFrom: z.string().optional(),
  retryCount: z.coerce.number().int().min(0).optional(),
  retryDelay: z.string().optional(),
});

export type AnySchema =
  | typeof jobSchema
  | typeof approvalSchema
  | typeof delaySchema
  | typeof conditionSchema
  | typeof notifySchema
  | typeof fanOutSchema
  | typeof parallelSchema
  | typeof httpSchema
  | typeof transformSchema
  | typeof switchSchema
  | typeof loopSchema
  | typeof subWorkflowSchema
  | typeof storageSchema
  | typeof errorTriggerSchema;

export function schemaForType(type: string): AnySchema {
  switch (type) {
    case "job": return jobSchema;
    case "approval": return approvalSchema;
    case "delay": return delaySchema;
    case "condition": return conditionSchema;
    case "notify": return notifySchema;
    case "fan-out": return fanOutSchema;
    case "parallel": return parallelSchema;
    case "http": return httpSchema;
    case "transform": return transformSchema;
    case "switch": return switchSchema;
    case "loop": return loopSchema;
    case "sub-workflow": return subWorkflowSchema;
    case "storage": return storageSchema;
    case "error-trigger": return errorTriggerSchema;
    default: return jobSchema;
  }
}

// ---------------------------------------------------------------------------
// Switch case editor helpers
// ---------------------------------------------------------------------------

export type SwitchCaseFormValue = {
  matchValue: string;
  stepId: string;
};

export function parseSwitchCasesForEditor(value: unknown): SwitchCaseFormValue[] {
  const parseObjectEntry = (entry: Record<string, unknown>): SwitchCaseFormValue | null => {
    const matchRaw = entry.match ?? entry.when ?? entry.value;
    const stepRaw = entry.next ?? entry.step ?? entry.target ?? entry.step_id;
    const stepId = typeof stepRaw === "string" ? stepRaw.trim() : "";
    if (!stepId) return null;
    return {
      matchValue: matchRaw == null ? "" : String(matchRaw),
      stepId,
    };
  };

  const parseArray = (items: unknown[]): SwitchCaseFormValue[] =>
    items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return parseObjectEntry(item as Record<string, unknown>);
      })
      .filter((item): item is SwitchCaseFormValue => item !== null);

  if (Array.isArray(value)) {
    return parseArray(value);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([matchValue, stepRaw]) => {
        const stepId = typeof stepRaw === "string" ? stepRaw.trim() : "";
        if (!stepId) return null;
        return { matchValue, stepId };
      })
      .filter((item): item is SwitchCaseFormValue => item !== null);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parseSwitchCasesForEditor(parsed);
    } catch {
      logger.debug("node-config", "JSON parse failed for switch cases");
      return [];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Mapping helpers (JSON object <-> editor string)
// ---------------------------------------------------------------------------

function mappingToEditorValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      logger.debug("node-config", "JSON.stringify failed in mappingToEditorValue");
      return "";
    }
  }
  return "";
}

function parseMappingEditorValue(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    logger.debug("node-config", "JSON parse failed in parseMappingEditorValue, treating as string");
    return trimmed;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// UnifiedNodeData -> form defaults
// ---------------------------------------------------------------------------

export function unifiedNodeToDefaults(d: UnifiedNodeData): Record<string, unknown> {
  const config = (d.config ?? {}) as Record<string, unknown>;
  const input = (d.input as Record<string, unknown> | undefined) ?? {};
  const metaRequires = Array.isArray(d.meta?.requires) ? d.meta.requires as unknown[] : [];
  const caps = d.meta?.capability
    ? [d.meta.capability, ...metaRequires].filter(Boolean)
    : undefined;
  return {
    label: d.label ?? "",
    topic: d.topic ?? config.topic ?? "",
    capabilities: caps ? caps.join(", ") : (Array.isArray(config.capabilities) ? (config.capabilities as string[]).join(", ") : (config.capabilities ?? "")),
    timeout: d.timeout_sec ? `${d.timeout_sec}s` : (config.timeout ?? ""),
    retryMax: d.retry?.max_retries ?? config.retryMax ?? 0,
    approverRoles: Array.isArray(config.approverRoles) ? (config.approverRoles as string[]).join(", ") : (config.approverRoles ?? ""),
    duration: d.delay_sec ? `${d.delay_sec}s` : (d.delay_until ?? config.duration ?? ""),
    expression: d.condition ?? config.expression ?? "",
    channel: config.channel ?? "",
    messageTemplate: config.messageTemplate ?? "",
    parallelism: d.max_parallel ?? config.parallelism ?? 1,
    parallelSteps: Array.isArray(input.steps)
      ? (input.steps as unknown[]).map((v) => String(v).trim()).filter(Boolean)
      : Array.isArray(config.parallelSteps)
        ? (config.parallelSteps as unknown[]).map((v) => String(v).trim()).filter(Boolean)
        : [],
    completionStrategy:
      (typeof input.strategy === "string" ? input.strategy
        : typeof config.completionStrategy === "string" ? config.completionStrategy
          : "all") ?? "all",
    requiredCount:
      (typeof input.required === "number" ? input.required
        : typeof config.requiredCount === "number" ? config.requiredCount
          : 1) ?? 1,
    forEach: d.for_each ?? config.forEach ?? "",
    // http
    method: (d.input as Record<string, unknown> | undefined)?.method ?? config.method ?? "GET",
    url: (d.input as Record<string, unknown> | undefined)?.url ?? config.url ?? "",
    headers: config.headers ?? "",
    body: config.body ?? "",
    // transform
    inputMapping: config.inputMapping ?? "",
    outputMapping: config.outputMapping ?? "",
    // switch
    switchCases: parseSwitchCasesForEditor(input.cases ?? config.switchCases ?? config.cases),
    defaultBranch:
      (typeof input.default === "string" && input.default.trim() ? input.default
        : typeof input.default_step === "string" && input.default_step.trim() ? input.default_step
          : typeof config.defaultBranch === "string" ? config.defaultBranch
            : "") ?? "",
    // loop
    bodyStep:
      (typeof input.body_step === "string" && input.body_step.trim() ? input.body_step
        : typeof input.body === "string" && input.body.trim() ? input.body
          : typeof config.bodyStep === "string" ? config.bodyStep
            : "") ?? "",
    maxIterations:
      (typeof input.max_iterations === "number" ? input.max_iterations
        : typeof input.maxIterations === "number" ? input.maxIterations
          : config.maxIterations) ?? 100,
    condition:
      (typeof input.condition === "string" ? input.condition
        : typeof input.while === "string" ? input.while
          : config.condition) ?? "",
    until: (typeof input.until === "string" ? input.until : config.until) ?? "",
    // sub-workflow
    workflowId:
      (typeof input.workflow_id === "string" && input.workflow_id.trim() ? input.workflow_id
        : typeof config.workflowId === "string" ? config.workflowId
          : "") ?? "",
    subInputMapping: mappingToEditorValue(input.input_mapping ?? config.inputMapping),
    subOutputMapping: mappingToEditorValue(input.output_mapping ?? config.outputMapping),
    outputPath: d.output_path ?? config.outputPath ?? "",
    // storage
    operation: input.operation ?? config.operation ?? "read",
    key: input.key ?? config.key ?? "",
    value: input.value != null ? String(input.value) : (config.value ?? ""),
    // error-trigger
    catchFrom: config.catchFrom ?? "any",
    retryCount: config.retryCount ?? 0,
    retryDelay: config.retryDelay ?? "",
  };
}

// ---------------------------------------------------------------------------
// Form values -> node data update
// ---------------------------------------------------------------------------

export function formToUnifiedNodeData(type: string, values: Record<string, unknown>) {
  const label = values.label as string;
  const config: Record<string, unknown> = {};
  const direct: Record<string, unknown> = {};

  switch (type) {
    case "job":
      config.topic = values.topic;
      direct.topic = values.topic;
      if (values.capabilities) {
        config.capabilities = (values.capabilities as string).split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (values.timeout) config.timeout = values.timeout;
      if (typeof values.retryMax === "number" && values.retryMax > 0) {
        config.retryMax = values.retryMax;
        direct.retry = { max_retries: values.retryMax };
      }
      break;
    case "approval":
      if (values.approverRoles) {
        config.approverRoles = (values.approverRoles as string).split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (values.timeout) config.timeout = values.timeout;
      break;
    case "delay":
      config.duration = values.duration;
      break;
    case "condition":
      config.expression = values.expression;
      direct.condition = values.expression;
      break;
    case "notify":
      config.channel = values.channel;
      if (values.messageTemplate) config.messageTemplate = values.messageTemplate;
      break;
    case "fan-out":
      if (values.forEach) {
        config.forEach = values.forEach;
        direct.for_each = values.forEach;
      }
      if (typeof values.parallelism === "number") {
        config.parallelism = values.parallelism;
        direct.max_parallel = values.parallelism;
      }
      break;
    case "parallel": {
      const selectedSteps = Array.isArray(values.parallelSteps)
        ? values.parallelSteps.map((v) => String(v).trim()).filter(Boolean)
        : typeof values.parallelSteps === "string"
          ? values.parallelSteps.split(",").map((v) => v.trim()).filter(Boolean)
          : [];
      const strategy = typeof values.completionStrategy === "string" ? values.completionStrategy : "all";
      const requiredCount =
        typeof values.requiredCount === "number"
          ? Math.floor(values.requiredCount)
          : typeof values.requiredCount === "string"
            ? Number.parseInt(values.requiredCount, 10)
            : undefined;
      config.parallelSteps = selectedSteps;
      config.completionStrategy = strategy;
      if (strategy === "n_of_m" && typeof requiredCount === "number" && requiredCount > 0) {
        config.requiredCount = requiredCount;
      }
      if (typeof values.parallelism === "number") {
        config.parallelism = values.parallelism;
        direct.max_parallel = values.parallelism;
      }
      const input: Record<string, unknown> = { steps: selectedSteps, strategy };
      if (strategy === "n_of_m" && typeof requiredCount === "number" && requiredCount > 0) {
        input.required = requiredCount;
      }
      direct.input = input;
      break;
    }
    case "http":
      config.method = values.method;
      config.url = values.url;
      if (values.headers) config.headers = values.headers;
      if (values.body) config.body = values.body;
      if (values.timeout) config.timeout = values.timeout;
      break;
    case "transform":
      config.expression = values.expression;
      direct.condition = values.expression;
      if (values.inputMapping) config.inputMapping = values.inputMapping;
      if (values.outputMapping) config.outputMapping = values.outputMapping;
      break;
    case "switch":
      if (typeof values.expression === "string" && values.expression.trim()) {
        config.expression = values.expression.trim();
        direct.condition = values.expression.trim();
      }
      if (typeof values.defaultBranch === "string" && values.defaultBranch.trim()) {
        config.defaultBranch = values.defaultBranch.trim();
      }
      if (Array.isArray(values.switchCases)) {
        const normalized = values.switchCases
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const raw = entry as Record<string, unknown>;
            const stepId =
              typeof raw.stepId === "string" && raw.stepId.trim() ? raw.stepId.trim()
                : typeof raw.step === "string" && raw.step.trim() ? raw.step.trim()
                  : "";
            if (!stepId) return null;
            const matchValue =
              typeof raw.matchValue === "string" ? raw.matchValue
                : typeof raw.match === "string" ? raw.match
                  : typeof raw.when === "string" ? raw.when
                    : raw.matchValue == null ? "" : String(raw.matchValue);
            return { match: matchValue, next: stepId };
          })
          .filter((entry): entry is { match: string; next: string } => entry !== null);
        const branches: Record<string, string> = {};
        for (let idx = 0; idx < normalized.length; idx++) {
          const entry = normalized[idx];
          const key = entry.match.trim() || `case_${idx + 1}`;
          branches[key] = entry.next;
        }
        if (typeof values.defaultBranch === "string" && values.defaultBranch.trim()) {
          branches.default = values.defaultBranch.trim();
        }
        config.switchCases = values.switchCases;
        config.cases = normalized;
        if (Object.keys(branches).length > 0) {
          config.branches = branches;
        }
        direct.input = {
          cases: normalized,
          ...(typeof values.defaultBranch === "string" && values.defaultBranch.trim()
            ? { default: values.defaultBranch.trim() }
            : {}),
        };
      } else if (typeof values.defaultBranch === "string" && values.defaultBranch.trim()) {
        direct.input = { default: values.defaultBranch.trim() };
      }
      break;
    case "loop":
      if (typeof values.bodyStep === "string" && values.bodyStep.trim()) {
        config.bodyStep = values.bodyStep.trim();
      }
      if (typeof values.maxIterations === "number") {
        config.maxIterations = values.maxIterations;
      }
      if (typeof values.condition === "string" && values.condition.trim()) {
        config.condition = values.condition.trim();
      }
      if (typeof values.until === "string" && values.until.trim()) {
        config.until = values.until.trim();
      }
      direct.input = {
        body_step: typeof values.bodyStep === "string" ? values.bodyStep.trim() : "",
        max_iterations: typeof values.maxIterations === "number" ? values.maxIterations : 100,
        ...(typeof values.condition === "string" && values.condition.trim()
          ? { condition: values.condition.trim() }
          : {}),
        ...(typeof values.until === "string" && values.until.trim()
          ? { until: values.until.trim() }
          : {}),
      };
      break;
    case "sub-workflow":
      config.workflowId = values.workflowId;
      if (typeof values.outputPath === "string" && values.outputPath.trim()) {
        config.outputPath = values.outputPath.trim();
        direct.output_path = values.outputPath.trim();
      }
      {
        const inputMapping = parseMappingEditorValue(values.subInputMapping);
        const outputMapping = parseMappingEditorValue(values.subOutputMapping);
        if (inputMapping !== undefined) config.inputMapping = inputMapping;
        if (outputMapping !== undefined) config.outputMapping = outputMapping;
        direct.input = {
          workflow_id: values.workflowId,
          ...(inputMapping !== undefined ? { input_mapping: inputMapping } : {}),
          ...(outputMapping !== undefined ? { output_mapping: outputMapping } : {}),
        };
      }
      break;
    case "storage": {
      const op = typeof values.operation === "string" ? values.operation : "read";
      const storageKey = typeof values.key === "string" ? values.key.trim() : "";
      config.operation = op;
      config.key = storageKey;
      const storageInput: Record<string, unknown> = { operation: op, key: storageKey };
      if (op === "write" && typeof values.value === "string" && values.value.trim()) {
        storageInput.value = values.value.trim();
        config.value = values.value.trim();
      }
      direct.input = storageInput;
      if (typeof values.outputPath === "string" && values.outputPath.trim()) {
        config.outputPath = values.outputPath.trim();
        direct.output_path = values.outputPath.trim();
      }
      break;
    }
    case "error-trigger":
      if (values.catchFrom) config.catchFrom = values.catchFrom;
      if (typeof values.retryCount === "number" && values.retryCount > 0) config.retryCount = values.retryCount;
      if (values.retryDelay) config.retryDelay = values.retryDelay;
      break;
  }

  return { label, config, ...direct };
}
