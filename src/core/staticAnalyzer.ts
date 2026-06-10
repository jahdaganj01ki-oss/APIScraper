import type {
  AnalyzeOptions,
  HttpMethod,
  ObservedRequest,
  ProgressReporter
} from "./types";
import { normalizeUrl, safeParseUrl } from "./urlUtils";

export interface RawCandidate {
  raw: string;
  method?: HttpMethod;
  kind: "absolute" | "path";
}

const METHODS: HttpMethod[] = [
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"
];

// fetch("..."), fetch('...'), fetch(`...`)
const FETCH_RE = /\bfetch\s*\(\s*([`'"])((?:\\.|(?!\1).)*?)\1/g;
// axios.get("..."), axios.post(`...`), axios({ url: "..." })
const AXIOS_METHOD_RE =
  /\baxios\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*([`'"])((?:\\.|(?!\2).)*?)\2/gi;
// $.ajax({ url: "...", type/method: "..." }) or generic { url: "..." }
const URL_PROP_RE = /\burl\s*:\s*([`'"])((?:\\.|(?!\1).)*?)\1/gi;
// XMLHttpRequest .open("METHOD", "URL")
const XHR_OPEN_RE =
  /\.open\s*\(\s*([`'"])(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\1\s*,\s*([`'"])((?:\\.|(?!\3).)*?)\3/gi;
// any absolute http(s) URL inside a quoted string
const ABS_URL_RE = /([`'"])(https?:\/\/[^`'"\s]+?)\1/gi;
// quoted API-ish path literals
const PATH_RE = /([`'"])(\/(?:api|graphql|rest|v\d|gql|services?|rpc)\/[A-Za-z0-9._~%\-/{}:?=&]*)\1/gi;

function isLikelyEndpoint(value: string): boolean {
  if (value.includes("\n") || value.includes(" ")) {
    return false;
  }
  if (value.startsWith("//") && !value.startsWith("///")) {
    return true; // protocol-relative
  }
  return true;
}

/** Pure, testable extraction of endpoint candidates from JS/HTML source. */
export function extractCandidatesFromSource(source: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  const push = (raw: string, kind: RawCandidate["kind"], method?: HttpMethod) => {
    if (raw && isLikelyEndpoint(raw)) {
      out.push({ raw, kind, method });
    }
  };

  let m: RegExpExecArray | null;

  FETCH_RE.lastIndex = 0;
  while ((m = FETCH_RE.exec(source))) {
    classifyAndPush(m[2], push);
  }

  AXIOS_METHOD_RE.lastIndex = 0;
  while ((m = AXIOS_METHOD_RE.exec(source))) {
    const method = m[1].toUpperCase() as HttpMethod;
    classifyAndPush(m[3], push, method);
  }

  XHR_OPEN_RE.lastIndex = 0;
  while ((m = XHR_OPEN_RE.exec(source))) {
    const method = m[2].toUpperCase() as HttpMethod;
    classifyAndPush(m[4], push, method);
  }

  URL_PROP_RE.lastIndex = 0;
  while ((m = URL_PROP_RE.exec(source))) {
    classifyAndPush(m[2], push);
  }

  ABS_URL_RE.lastIndex = 0;
  while ((m = ABS_URL_RE.exec(source))) {
    push(m[2], "absolute");
  }

  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(source))) {
    push(m[2], "path");
  }

  return dedupeCandidates(out);
}

function classifyAndPush(
  value: string,
  push: (raw: string, kind: RawCandidate["kind"], method?: HttpMethod) => void,
  method?: HttpMethod
): void {
  const v = value.trim();
  if (!v) {
    return;
  }
  if (/^https?:\/\//i.test(v) || v.startsWith("//")) {
    push(v, "absolute", method);
  } else if (v.startsWith("/")) {
    push(v, "path", method);
  }
}

function dedupeCandidates(items: RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const it of items) {
    const key = `${it.method ?? ""} ${it.raw}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/** Extract <script src> URLs from HTML. */
export function extractScriptUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*([`'"])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = normalizeUrl(m[2], baseUrl);
    if (abs && /\.m?js(\?|$)/i.test(abs)) {
      out.push(abs);
    }
  }
  return Array.from(new Set(out));
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; contentType: string; body: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();
    return { ok: res.ok, status: res.status, contentType, body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function candidateToObserved(
  cand: RawCandidate,
  baseUrl: string,
  fromPage: string
): ObservedRequest | undefined {
  const abs = normalizeUrl(cand.raw, baseUrl);
  if (!abs) {
    return undefined;
  }
  const method: HttpMethod =
    cand.method && METHODS.includes(cand.method) ? cand.method : "GET";
  return {
    url: abs,
    method,
    source: "static",
    fromPage
  };
}

/** Fetch the start page + its JS bundles and statically extract endpoints. */
export async function staticAnalyze(
  options: AnalyzeOptions,
  reporter: ProgressReporter
): Promise<ObservedRequest[]> {
  const headers = { "User-Agent": "APIScraper/0.1", ...options.extraHeaders };
  const observed: ObservedRequest[] = [];
  const start = safeParseUrl(options.startUrl);
  if (!start) {
    return observed;
  }

  reporter.log(`[static] fetching ${options.startUrl}`);
  const page = await fetchText(options.startUrl, headers);
  if (!page) {
    reporter.log(`[static] failed to fetch start page`);
    return observed;
  }

  const sources: Array<{ url: string; body: string }> = [
    { url: options.startUrl, body: page.body }
  ];

  const scriptUrls = extractScriptUrls(page.body, options.startUrl).slice(0, 40);
  reporter.log(`[static] found ${scriptUrls.length} script bundle(s)`);
  for (const scriptUrl of scriptUrls) {
    const js = await fetchText(scriptUrl, headers);
    if (js && js.ok) {
      sources.push({ url: scriptUrl, body: js.body });
    }
  }

  const seen = new Set<string>();
  for (const src of sources) {
    const candidates = extractCandidatesFromSource(src.body);
    for (const cand of candidates) {
      const obs = candidateToObserved(cand, options.startUrl, src.url);
      if (!obs) {
        continue;
      }
      const key = `${obs.method} ${obs.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      observed.push(obs);
    }
  }

  reporter.log(`[static] extracted ${observed.length} candidate endpoint(s)`);
  return observed;
}
