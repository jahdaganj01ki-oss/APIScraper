import type {
  AnalyzeOptions,
  Endpoint,
  HttpMethod,
  ObservedRequest,
  ParamInfo
} from "./types";
import { inferScalarType, tryParseJson } from "./inference";
import {
  classifyApiKind,
  isStaticAsset,
  safeParseUrl,
  sameRegistrableHost,
  templatizePath
} from "./urlUtils";

const MAX_EXAMPLES = 5;

interface MutableEndpoint extends Endpoint {
  paramMap: Map<string, ParamInfo>;
}

function endpointKey(host: string, template: string): string {
  return `${host}::${template}`;
}

function addExample(arr: string[], value: string): void {
  if (value && !arr.includes(value) && arr.length < MAX_EXAMPLES) {
    arr.push(value);
  }
}

function addUnique<T>(arr: T[], value: T | undefined): void {
  if (value !== undefined && !arr.includes(value)) {
    arr.push(value);
  }
}

function upsertParam(map: Map<string, ParamInfo>, param: ParamInfo): void {
  const key = `${param.in}:${param.name}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      ...param,
      examples: param.examples.slice(0, MAX_EXAMPLES)
    });
    return;
  }
  for (const ex of param.examples) {
    if (ex && !existing.examples.includes(ex) && existing.examples.length < MAX_EXAMPLES) {
      existing.examples.push(ex);
    }
  }
  if (existing.type !== param.type && param.type !== "string") {
    existing.type = param.type;
  }
}

/** Build normalized endpoints from raw observations. */
export function buildEndpoints(
  observed: ObservedRequest[],
  options: AnalyzeOptions
): Endpoint[] {
  const startOrigin = safeParseUrl(options.startUrl);
  const map = new Map<string, MutableEndpoint>();

  for (const obs of observed) {
    const parsed = safeParseUrl(obs.url);
    if (!parsed) {
      continue;
    }
    if (!options.includeStaticAssets && isStaticAsset(obs.url, obs.resourceType)) {
      continue;
    }
    if (
      !options.includeThirdParty &&
      startOrigin &&
      !sameRegistrableHost(obs.url, options.startUrl)
    ) {
      continue;
    }

    const kind = classifyApiKind(obs.url, obs.resourceType);
    const { template, pathParams } = templatizePath(parsed.pathname);
    const key = endpointKey(parsed.host, template);

    let ep = map.get(key);
    if (!ep) {
      ep = {
        id: key,
        kind,
        host: parsed.host,
        origin: parsed.origin,
        pathTemplate: template,
        methods: [],
        params: [],
        sources: [],
        statuses: [],
        contentTypes: [],
        examples: [],
        count: 0,
        paramMap: new Map<string, ParamInfo>()
      };
      map.set(key, ep);
    }
    if (kind !== "unknown" && ep.kind === "unknown") {
      ep.kind = kind;
    }

    addUnique(ep.methods, obs.method);
    addUnique(ep.sources, obs.source);
    addUnique(ep.statuses, obs.status);
    addUnique(ep.contentTypes, obs.responseContentType?.split(";")[0]?.trim());
    addExample(ep.examples, obs.url);
    ep.count += 1;

    // path params
    for (const name of pathParams) {
      upsertParam(ep.paramMap, {
        name,
        in: "path",
        type: "string",
        required: true,
        examples: []
      });
    }

    // query params
    parsed.searchParams.forEach((value, name) => {
      upsertParam(ep!.paramMap, {
        name,
        in: "query",
        type: inferScalarType(value),
        required: false,
        examples: value ? [value] : []
      });
    });

    // body params (top-level JSON keys)
    if (obs.requestBody) {
      if (!ep.sampleRequestBody) {
        ep.sampleRequestBody = obs.requestBody.slice(0, 4000);
      }
      const parsedBody = tryParseJson(obs.requestBody);
      if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
        for (const [name, val] of Object.entries(parsedBody as Record<string, unknown>)) {
          upsertParam(ep.paramMap, {
            name,
            in: "body",
            type: jsTypeToSchema(val),
            required: false,
            examples: []
          });
        }
      }
      // GraphQL operation names
      if (kind === "graphql") {
        const opName = extractGraphqlOperation(obs.requestBody);
        if (opName) {
          ep.graphqlOperations = ep.graphqlOperations ?? [];
          addUnique(ep.graphqlOperations, opName);
        }
      }
    }

    if (!ep.sampleResponse && obs.responseSample) {
      ep.sampleResponse = obs.responseSample.slice(0, 4000);
    }
  }

  const endpoints: Endpoint[] = [];
  for (const ep of map.values()) {
    ep.params = Array.from(ep.paramMap.values());
    ep.methods.sort();
    const { paramMap: _paramMap, ...rest } = ep;
    endpoints.push(rest);
  }

  endpoints.sort((a, b) => {
    if (a.host !== b.host) {
      return a.host.localeCompare(b.host);
    }
    return a.pathTemplate.localeCompare(b.pathTemplate);
  });

  return endpoints;
}

function jsTypeToSchema(val: unknown): string {
  if (val === null) {
    return "null";
  }
  if (Array.isArray(val)) {
    return "array";
  }
  const t = typeof val;
  if (t === "number") {
    return Number.isInteger(val) ? "integer" : "number";
  }
  if (t === "boolean") {
    return "boolean";
  }
  if (t === "object") {
    return "object";
  }
  return "string";
}

function extractGraphqlOperation(body: string): string | undefined {
  const parsed = tryParseJson(body);
  let query: string | undefined;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.operationName === "string" && obj.operationName) {
      return obj.operationName;
    }
    if (typeof obj.query === "string") {
      query = obj.query;
    }
  }
  if (!query && typeof body === "string") {
    query = body;
  }
  if (!query) {
    return undefined;
  }
  const m = /\b(query|mutation|subscription)\s+([A-Za-z0-9_]+)/.exec(query);
  return m ? m[2] : undefined;
}

export const _internal = { jsTypeToSchema, extractGraphqlOperation };

export type { HttpMethod };
