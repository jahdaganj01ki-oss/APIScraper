import { describe, it, expect } from "vitest";
import { buildEndpoints } from "../core/endpointStore";
import type { AnalyzeOptions, ObservedRequest } from "../core/types";

const baseOptions: AnalyzeOptions = {
  startUrl: "https://example.com",
  maxDepth: 1,
  maxPages: 10,
  dynamicEnabled: false,
  headless: true,
  waitMs: 0,
  includeThirdParty: true,
  includeStaticAssets: false,
  extraHeaders: {},
  respectRobots: true,
  crawlDelayMs: 0,
  graphqlIntrospection: false
};

describe("buildEndpoints", () => {
  it("groups requests by path template and merges methods", () => {
    const observed: ObservedRequest[] = [
      { url: "https://example.com/api/users/1", method: "GET", source: "dynamic", status: 200 },
      { url: "https://example.com/api/users/2", method: "GET", source: "dynamic", status: 200 },
      { url: "https://example.com/api/users/2", method: "DELETE", source: "dynamic", status: 204 }
    ];
    const eps = buildEndpoints(observed, baseOptions);
    expect(eps.length).toBe(1);
    expect(eps[0].pathTemplate).toBe("/api/users/{id}");
    expect(eps[0].methods).toEqual(["DELETE", "GET"]);
    expect(eps[0].statuses.sort()).toEqual([200, 204]);
    expect(eps[0].count).toBe(3);
  });

  it("captures query params", () => {
    const observed: ObservedRequest[] = [
      { url: "https://example.com/search?q=hello&page=2", method: "GET", source: "static" }
    ];
    const eps = buildEndpoints(observed, baseOptions);
    const params = eps[0].params;
    const q = params.find((p) => p.name === "q");
    const page = params.find((p) => p.name === "page");
    expect(q?.in).toBe("query");
    expect(page?.type).toBe("integer");
  });

  it("captures json body params and graphql ops", () => {
    const observed: ObservedRequest[] = [
      {
        url: "https://example.com/graphql",
        method: "POST",
        source: "dynamic",
        requestBody: JSON.stringify({ operationName: "GetUser", query: "query GetUser { me { id } }" })
      }
    ];
    const eps = buildEndpoints(observed, baseOptions);
    expect(eps[0].kind).toBe("graphql");
    expect(eps[0].graphqlOperations).toContain("GetUser");
  });

  it("filters static assets by default", () => {
    const observed: ObservedRequest[] = [
      { url: "https://example.com/logo.png", method: "GET", source: "dynamic", resourceType: "image" },
      { url: "https://example.com/api/data", method: "GET", source: "dynamic" }
    ];
    const eps = buildEndpoints(observed, baseOptions);
    expect(eps.length).toBe(1);
    expect(eps[0].pathTemplate).toBe("/api/data");
  });

  it("excludes third-party hosts when disabled", () => {
    const observed: ObservedRequest[] = [
      { url: "https://example.com/api/a", method: "GET", source: "dynamic" },
      { url: "https://tracker.net/collect", method: "POST", source: "dynamic" }
    ];
    const eps = buildEndpoints(observed, { ...baseOptions, includeThirdParty: false });
    expect(eps.length).toBe(1);
    expect(eps[0].host).toBe("example.com");
  });
});
