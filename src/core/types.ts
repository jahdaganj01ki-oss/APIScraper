/** Shared, framework-agnostic types. This module must NOT import `vscode`. */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE";

export type DiscoverySource = "dynamic" | "static" | "well-known";

export type ApiKind = "rest" | "graphql" | "websocket" | "unknown";

/** A single observed network request/response pair. */
export interface ObservedRequest {
  url: string;
  method: HttpMethod;
  resourceType?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseContentType?: string;
  responseSample?: string;
  source: DiscoverySource;
  fromPage?: string;
}

export interface ParamInfo {
  name: string;
  in: "path" | "query" | "header" | "body";
  type: string;
  required: boolean;
  examples: string[];
}

/** A normalized, de-duplicated endpoint (host + path template). */
export interface Endpoint {
  id: string;
  kind: ApiKind;
  host: string;
  origin: string;
  /** Path with dynamic segments parameterized, e.g. /api/users/{id}. */
  pathTemplate: string;
  methods: HttpMethod[];
  params: ParamInfo[];
  sources: DiscoverySource[];
  statuses: number[];
  contentTypes: string[];
  /** Raw observed full URLs (capped). */
  examples: string[];
  sampleRequestBody?: string;
  sampleResponse?: string;
  graphqlOperations?: string[];
  count: number;
}

export interface AnalysisStats {
  pagesVisited: number;
  requestsObserved: number;
  endpoints: number;
  dynamicUsed: boolean;
  staticUsed: boolean;
  durationMs: number;
  warnings: string[];
}

export interface AnalysisResult {
  startUrl: string;
  startedAt: string;
  endpoints: Endpoint[];
  stats: AnalysisStats;
}

export interface AnalyzeOptions {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  dynamicEnabled: boolean;
  headless: boolean;
  waitMs: number;
  includeThirdParty: boolean;
  includeStaticAssets: boolean;
  extraHeaders: Record<string, string>;
  /** Path to a Playwright storageState JSON file (cookies/localStorage) for authenticated runs. */
  storageStatePath?: string;
  /** Honor robots.txt Disallow rules while crawling. */
  respectRobots: boolean;
  /** Delay (ms) between crawled pages to be polite / avoid rate limits. */
  crawlDelayMs: number;
  /** Send a GraphQL introspection query to discovered GraphQL endpoints. */
  graphqlIntrospection: boolean;
}

export interface ProgressReporter {
  log(message: string): void;
  setPhase?(phase: string): void;
}
