import { describe, it, expect } from "vitest";
import { buildEndpoints } from "../core/endpointStore";
import { generateOpenApi } from "../core/export/openapi";
import { generatePostmanCollection } from "../core/export/postman";
import { generateHar } from "../core/export/har";
import type { AnalysisResult, AnalyzeOptions, ObservedRequest } from "../core/types";

const options: AnalyzeOptions = {
  startUrl: "https://example.com",
  maxDepth: 1,
  maxPages: 10,
  dynamicEnabled: false,
  headless: true,
  waitMs: 0,
  includeThirdParty: true,
  includeStaticAssets: false,
  extraHeaders: {}
};

function makeResult(): AnalysisResult {
  const observed: ObservedRequest[] = [
    {
      url: "https://example.com/api/users/1",
      method: "GET",
      source: "dynamic",
      status: 200,
      responseContentType: "application/json",
      responseSample: JSON.stringify({ id: 1, name: "a" })
    },
    {
      url: "https://example.com/api/users",
      method: "POST",
      source: "dynamic",
      status: 201,
      requestBody: JSON.stringify({ name: "b", age: 30 })
    }
  ];
  const endpoints = buildEndpoints(observed, options);
  return {
    startUrl: options.startUrl,
    startedAt: new Date().toISOString(),
    endpoints,
    stats: {
      pagesVisited: 1,
      requestsObserved: observed.length,
      endpoints: endpoints.length,
      dynamicUsed: true,
      staticUsed: false,
      durationMs: 100,
      warnings: []
    }
  };
}

describe("generateOpenApi", () => {
  it("produces a valid-shaped OpenAPI doc", () => {
    const doc = generateOpenApi(makeResult()) as Record<string, unknown>;
    expect(doc.openapi).toBe("3.1.0");
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/users/{id}"]).toBeTruthy();
    expect(paths["/api/users/{id}"].get).toBeTruthy();
    expect(paths["/api/users"].post).toBeTruthy();
    const post = paths["/api/users"].post as Record<string, unknown>;
    expect(post.requestBody).toBeTruthy();
  });
});

describe("generatePostmanCollection", () => {
  it("groups by host and includes requests", () => {
    const doc = generatePostmanCollection(makeResult()) as Record<string, unknown>;
    const items = doc.item as Array<{ name: string; item: unknown[] }>;
    expect(items[0].name).toBe("example.com");
    expect(items[0].item.length).toBe(2);
  });
});

describe("generateHar", () => {
  it("produces HAR entries", () => {
    const doc = generateHar(makeResult()) as { log: { entries: unknown[] } };
    expect(doc.log.entries.length).toBe(2);
  });
});
