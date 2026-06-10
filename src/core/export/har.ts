import type { AnalysisResult, Endpoint } from "../types";

function entriesForEndpoint(ep: Endpoint, startedAt: string): unknown[] {
  const methods = ep.methods.length > 0 ? ep.methods : ["GET"];
  const exampleUrl = ep.examples[0] ?? `${ep.origin}${ep.pathTemplate}`;
  return methods.map((method) => {
    const queryString = ep.params
      .filter((p) => p.in === "query")
      .map((p) => ({ name: p.name, value: p.examples[0] ?? "" }));
    const hasBody = (ep.sampleRequestBody && method !== "GET" && method !== "HEAD") || false;
    return {
      startedDateTime: startedAt,
      time: 0,
      request: {
        method,
        url: exampleUrl,
        httpVersion: "HTTP/1.1",
        headers: [],
        queryString,
        ...(hasBody
          ? {
              postData: {
                mimeType: "application/json",
                text: ep.sampleRequestBody ?? ""
              }
            }
          : {}),
        headersSize: -1,
        bodySize: hasBody ? (ep.sampleRequestBody?.length ?? 0) : 0
      },
      response: {
        status: ep.statuses[0] ?? 0,
        statusText: "",
        httpVersion: "HTTP/1.1",
        headers: ep.contentTypes[0]
          ? [{ name: "content-type", value: ep.contentTypes[0] }]
          : [],
        content: {
          size: ep.sampleResponse?.length ?? 0,
          mimeType: ep.contentTypes[0] ?? "application/json",
          text: ep.sampleResponse ?? ""
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: ep.sampleResponse?.length ?? 0
      },
      cache: {},
      timings: { send: 0, wait: 0, receive: 0 }
    };
  });
}

/** Generate a HAR 1.2 log from analysis results. */
export function generateHar(result: AnalysisResult): Record<string, unknown> {
  const entries: unknown[] = [];
  for (const ep of result.endpoints) {
    entries.push(...entriesForEndpoint(ep, result.startedAt));
  }
  return {
    log: {
      version: "1.2",
      creator: { name: "APIScraper", version: "0.1.0" },
      pages: [],
      entries
    }
  };
}
