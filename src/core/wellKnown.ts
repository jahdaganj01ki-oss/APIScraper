import type { ObservedRequest, ProgressReporter } from "./types";
import { normalizeUrl, safeParseUrl } from "./urlUtils";

const SPEC_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/swagger/v1/swagger.json",
  "/v2/api-docs",
  "/v3/api-docs",
  "/api-docs",
  "/api/swagger.json",
  "/.well-known/openapi.json"
];

const DISCOVERY_PATHS = ["/robots.txt", "/sitemap.xml"];

async function tryFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 10000
): Promise<{ status: number; contentType: string; body: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();
    return { status: res.status, contentType, body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe common spec/discovery endpoints to seed analysis. */
export async function probeWellKnown(
  startUrl: string,
  extraHeaders: Record<string, string>,
  reporter: ProgressReporter
): Promise<ObservedRequest[]> {
  const origin = safeParseUrl(startUrl)?.origin;
  if (!origin) {
    return [];
  }
  const headers = { "User-Agent": "APIScraper/0.1", ...extraHeaders };
  const observed: ObservedRequest[] = [];

  for (const path of [...SPEC_PATHS, ...DISCOVERY_PATHS]) {
    const url = normalizeUrl(path, origin);
    if (!url) {
      continue;
    }
    const res = await tryFetch(url, headers);
    if (!res || res.status >= 400) {
      continue;
    }
    reporter.log(`[well-known] ${res.status} ${url}`);
    observed.push({
      url,
      method: "GET",
      status: res.status,
      responseContentType: res.contentType,
      responseSample: res.body.slice(0, 4000),
      source: "well-known"
    });

    if (SPEC_PATHS.includes(path)) {
      observed.push(...extractFromOpenApi(res.body, origin));
    }
    if (path === "/sitemap.xml") {
      observed.push(...extractFromSitemap(res.body));
    }
  }

  return observed;
}

function extractFromOpenApi(body: string, origin: string): ObservedRequest[] {
  const out: ObservedRequest[] = [];
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return out;
  }
  if (!doc || typeof doc !== "object") {
    return out;
  }
  const root = doc as Record<string, unknown>;
  const paths = root.paths as Record<string, unknown> | undefined;
  if (!paths) {
    return out;
  }
  let base = origin;
  const servers = root.servers as Array<{ url?: string }> | undefined;
  if (servers && servers[0]?.url) {
    base = normalizeUrl(servers[0].url, origin) ?? origin;
  }
  for (const [p, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const url = normalizeUrl(p.replace(/\{[^}]+\}/g, "1"), base.endsWith("/") ? base : base + "/");
    if (!url) {
      continue;
    }
    for (const method of Object.keys(item as Record<string, unknown>)) {
      const upper = method.toUpperCase();
      if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(upper)) {
        out.push({
          url,
          method: upper as ObservedRequest["method"],
          source: "well-known"
        });
      }
    }
  }
  return out;
}

function extractFromSitemap(body: string): ObservedRequest[] {
  const out: ObservedRequest[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(body)) && count < 50) {
    const url = normalizeUrl(m[1]);
    if (url) {
      out.push({ url, method: "GET", source: "well-known" });
      count += 1;
    }
  }
  return out;
}
