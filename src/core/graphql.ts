import type { ObservedRequest, ProgressReporter } from "./types";

/** Compact GraphQL introspection query (enough to recover the type/field surface). */
export const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      fields(includeDeprecated: true) {
        name
        args { name }
      }
    }
  }
}`;

interface IntrospectionField {
  name?: string;
}
interface IntrospectionType {
  kind?: string;
  name?: string;
  fields?: IntrospectionField[] | null;
}
interface IntrospectionSchema {
  queryType?: { name?: string } | null;
  mutationType?: { name?: string } | null;
  subscriptionType?: { name?: string } | null;
  types?: IntrospectionType[];
}

/** Human-readable summary of root operations from an introspection result. */
export function summarizeIntrospection(json: unknown): string[] {
  const schema = extractSchema(json);
  if (!schema) {
    return [];
  }
  const out: string[] = [];
  const rootNames: Array<[string, string | undefined]> = [
    ["query", schema.queryType?.name ?? undefined],
    ["mutation", schema.mutationType?.name ?? undefined],
    ["subscription", schema.subscriptionType?.name ?? undefined]
  ];
  const byName = new Map<string, IntrospectionType>();
  for (const t of schema.types ?? []) {
    if (t.name) {
      byName.set(t.name, t);
    }
  }
  for (const [op, typeName] of rootNames) {
    if (!typeName) {
      continue;
    }
    const t = byName.get(typeName);
    const fields = (t?.fields ?? []).map((f) => f.name).filter(Boolean) as string[];
    for (const f of fields) {
      out.push(`${op} ${f}`);
    }
  }
  return out;
}

function extractSchema(json: unknown): IntrospectionSchema | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const data = (json as { data?: { __schema?: IntrospectionSchema } }).data;
  if (data?.__schema) {
    return data.__schema;
  }
  const direct = (json as { __schema?: IntrospectionSchema }).__schema;
  return direct;
}

async function postIntrospection(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 12000
): Promise<{ status: number; body: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      signal: controller.signal
    });
    const body = await res.text();
    return { status: res.status, body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Run introspection against each unique GraphQL endpoint URL. */
export async function introspectGraphql(
  urls: string[],
  extraHeaders: Record<string, string>,
  reporter: ProgressReporter
): Promise<ObservedRequest[]> {
  const observed: ObservedRequest[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    reporter.log(`[graphql] introspecting ${url}`);
    const res = await postIntrospection(url, extraHeaders);
    if (!res || res.status >= 400) {
      continue;
    }
    const parsed = safeJson(res.body);
    const ops = summarizeIntrospection(parsed);
    if (ops.length === 0 && !res.body.includes("__schema")) {
      continue;
    }
    reporter.log(`[graphql] ${url}: ${ops.length} root field(s)`);
    observed.push({
      url,
      method: "POST",
      status: res.status,
      responseContentType: "application/json",
      requestBody: JSON.stringify({ query: "introspection" }),
      responseSample: res.body.slice(0, 4000),
      source: "well-known"
    });
  }
  return observed;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
