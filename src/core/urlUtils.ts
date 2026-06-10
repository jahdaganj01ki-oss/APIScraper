import type { ApiKind } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX24_RE = /^[0-9a-f]{24}$/i; // mongo object id
const LONGHEX_RE = /^[0-9a-f]{16,}$/i;
const NUMERIC_RE = /^\d+$/;
const SLUG_WITH_ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*-\d{2,}$/i;

const STATIC_ASSET_EXT = new Set([
  "css", "scss", "less",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "webm", "ogg", "mp3", "wav",
  "map"
]);

const STATIC_RESOURCE_TYPES = new Set([
  "image", "font", "stylesheet", "media", "manifest"
]);

export function safeParseUrl(input: string, base?: string): URL | undefined {
  try {
    return new URL(input, base);
  } catch {
    return undefined;
  }
}

export function normalizeUrl(input: string, base?: string): string | undefined {
  const url = safeParseUrl(input, base);
  if (!url) {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "ws:" && url.protocol !== "wss:") {
    return undefined;
  }
  url.hash = "";
  return url.toString();
}

/** Decide whether a path segment looks like a dynamic identifier. */
export function isDynamicSegment(segment: string): boolean {
  const decoded = decodeURIComponentSafe(segment);
  if (decoded.length === 0) {
    return false;
  }
  if (NUMERIC_RE.test(decoded)) {
    return true;
  }
  if (UUID_RE.test(decoded)) {
    return true;
  }
  if (HEX24_RE.test(decoded)) {
    return true;
  }
  if (LONGHEX_RE.test(decoded)) {
    return true;
  }
  if (SLUG_WITH_ID_RE.test(decoded)) {
    return true;
  }
  return false;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface TemplatedPath {
  template: string;
  pathParams: string[];
}

/** Replace dynamic-looking segments with {paramN} placeholders. */
export function templatizePath(pathname: string): TemplatedPath {
  const segments = pathname.split("/");
  const pathParams: string[] = [];
  let idx = 0;
  const out = segments.map((seg) => {
    if (seg === "") {
      return seg;
    }
    if (isDynamicSegment(seg)) {
      idx += 1;
      const name = idx === 1 ? "id" : `param${idx}`;
      pathParams.push(name);
      return `{${name}}`;
    }
    return seg;
  });
  let template = out.join("/");
  if (template.length > 1 && template.endsWith("/")) {
    template = template.slice(0, -1);
  }
  return { template: template || "/", pathParams };
}

export function isStaticAsset(url: string, resourceType?: string): boolean {
  if (resourceType && STATIC_RESOURCE_TYPES.has(resourceType.toLowerCase())) {
    return true;
  }
  const parsed = safeParseUrl(url);
  if (!parsed) {
    return false;
  }
  const lastSeg = parsed.pathname.split("/").pop() ?? "";
  const dot = lastSeg.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  const ext = lastSeg.slice(dot + 1).toLowerCase();
  return STATIC_ASSET_EXT.has(ext);
}

export function classifyApiKind(url: string, resourceType?: string): ApiKind {
  const parsed = safeParseUrl(url);
  if (!parsed) {
    return "unknown";
  }
  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    return "websocket";
  }
  if (resourceType === "websocket") {
    return "websocket";
  }
  if (/\/graphql\b/i.test(parsed.pathname) || /graphql/i.test(parsed.hostname)) {
    return "graphql";
  }
  return "rest";
}

export function sameOrigin(a: string, b: string): boolean {
  const ua = safeParseUrl(a);
  const ub = safeParseUrl(b);
  return !!ua && !!ub && ua.origin === ub.origin;
}

export function sameRegistrableHost(a: string, b: string): boolean {
  const ua = safeParseUrl(a);
  const ub = safeParseUrl(b);
  if (!ua || !ub) {
    return false;
  }
  return registrableHost(ua.hostname) === registrableHost(ub.hostname);
}

function registrableHost(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) {
    return hostname;
  }
  return parts.slice(-2).join(".");
}
