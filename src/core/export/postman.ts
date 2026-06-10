import type { AnalysisResult, Endpoint } from "../types";

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host: string[];
  path: string[];
  query?: Array<{ key: string; value: string }>;
}

function buildUrl(ep: Endpoint): PostmanUrl {
  const raw = `${ep.origin}${ep.pathTemplate}`;
  let protocol: string | undefined;
  let host: string[] = [ep.host];
  try {
    const u = new URL(ep.origin);
    protocol = u.protocol.replace(":", "");
    host = u.host.split(".");
  } catch {
    /* keep defaults */
  }
  const path = ep.pathTemplate.split("/").filter((s) => s.length > 0);
  const query = ep.params
    .filter((p) => p.in === "query")
    .map((p) => ({ key: p.name, value: p.examples[0] ?? "" }));
  return { raw, protocol, host, path, query: query.length ? query : undefined };
}

/** Generate a Postman Collection v2.1 from analysis results. */
export function generatePostmanCollection(result: AnalysisResult): Record<string, unknown> {
  const groups = new Map<string, unknown[]>();

  for (const ep of result.endpoints) {
    const methods = ep.methods.length > 0 ? ep.methods : ["GET"];
    for (const method of methods) {
      const bodyParam = ep.params.some((p) => p.in === "body") || ep.sampleRequestBody;
      const item: Record<string, unknown> = {
        name: `${method} ${ep.pathTemplate}`,
        request: {
          method,
          header: [],
          url: buildUrl(ep),
          ...(bodyParam && method !== "GET" && method !== "HEAD"
            ? {
                body: {
                  mode: "raw",
                  raw: ep.sampleRequestBody ?? "{}",
                  options: { raw: { language: "json" } }
                }
              }
            : {})
        }
      };
      const list = groups.get(ep.host) ?? [];
      list.push(item);
      groups.set(ep.host, list);
    }
  }

  const items = Array.from(groups.entries()).map(([host, list]) => ({
    name: host,
    item: list
  }));

  return {
    info: {
      name: `APIScraper – ${hostOf(result.startUrl)}`,
      description: `Auto-generated from ${result.startUrl} on ${result.startedAt}.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: items
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
