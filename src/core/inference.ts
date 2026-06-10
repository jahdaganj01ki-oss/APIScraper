/** Lightweight value -> JSON-schema-ish type inference. */

export function inferScalarType(value: string): string {
  const v = value.trim();
  if (v === "") {
    return "string";
  }
  if (v === "true" || v === "false") {
    return "boolean";
  }
  if (/^-?\d+$/.test(v)) {
    return "integer";
  }
  if (/^-?\d*\.\d+$/.test(v)) {
    return "number";
  }
  return "string";
}

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  example?: unknown;
};

/** Infer a small JSON schema from a parsed JSON value (depth-limited). */
export function inferJsonSchema(value: unknown, depth = 0): JsonSchema {
  if (depth > 6) {
    return {};
  }
  if (value === null) {
    return { type: "null" };
  }
  if (Array.isArray(value)) {
    const first = value.length > 0 ? value[0] : undefined;
    return {
      type: "array",
      items: first === undefined ? {} : inferJsonSchema(first, depth + 1)
    };
  }
  switch (typeof value) {
    case "boolean":
      return { type: "boolean" };
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number" };
    case "string":
      return { type: "string" };
    case "object": {
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        properties[k] = inferJsonSchema(v, depth + 1);
      }
      return { type: "object", properties };
    }
    default:
      return {};
  }
}

export function tryParseJson(text: string | undefined): unknown {
  if (!text) {
    return undefined;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}
