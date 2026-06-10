import { describe, it, expect } from "vitest";
import {
  templatizePath,
  isDynamicSegment,
  isStaticAsset,
  classifyApiKind,
  normalizeUrl,
  sameRegistrableHost
} from "../core/urlUtils";

describe("isDynamicSegment", () => {
  it("detects numeric ids", () => {
    expect(isDynamicSegment("123")).toBe(true);
  });
  it("detects uuids", () => {
    expect(isDynamicSegment("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("detects mongo object ids", () => {
    expect(isDynamicSegment("507f1f77bcf86cd799439011")).toBe(true);
  });
  it("detects slug-with-id", () => {
    expect(isDynamicSegment("my-post-12345")).toBe(true);
  });
  it("keeps plain words static", () => {
    expect(isDynamicSegment("users")).toBe(false);
    expect(isDynamicSegment("api")).toBe(false);
  });
});

describe("templatizePath", () => {
  it("parameterizes ids", () => {
    const { template, pathParams } = templatizePath("/api/users/123/posts/456");
    expect(template).toBe("/api/users/{id}/posts/{param2}");
    expect(pathParams).toEqual(["id", "param2"]);
  });
  it("leaves static paths untouched", () => {
    expect(templatizePath("/api/v1/health").template).toBe("/api/v1/health");
  });
  it("strips trailing slash", () => {
    expect(templatizePath("/api/users/").template).toBe("/api/users");
  });
  it("handles root", () => {
    expect(templatizePath("/").template).toBe("/");
  });
});

describe("isStaticAsset", () => {
  it("flags images and fonts", () => {
    expect(isStaticAsset("https://x.com/a/logo.png")).toBe(true);
    expect(isStaticAsset("https://x.com/font.woff2")).toBe(true);
  });
  it("does not flag api routes", () => {
    expect(isStaticAsset("https://x.com/api/users")).toBe(false);
  });
  it("respects resource type", () => {
    expect(isStaticAsset("https://x.com/whatever", "image")).toBe(true);
  });
});

describe("classifyApiKind", () => {
  it("detects graphql", () => {
    expect(classifyApiKind("https://x.com/graphql")).toBe("graphql");
  });
  it("detects websocket", () => {
    expect(classifyApiKind("wss://x.com/socket")).toBe("websocket");
  });
  it("defaults to rest", () => {
    expect(classifyApiKind("https://x.com/api/users")).toBe("rest");
  });
});

describe("normalizeUrl", () => {
  it("resolves relative paths and drops hash", () => {
    expect(normalizeUrl("/api/x#frag", "https://a.com/page")).toBe("https://a.com/api/x");
  });
  it("rejects non-http schemes", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeUndefined();
  });
});

describe("sameRegistrableHost", () => {
  it("matches subdomains", () => {
    expect(sameRegistrableHost("https://api.x.com/a", "https://www.x.com/b")).toBe(true);
  });
  it("rejects different domains", () => {
    expect(sameRegistrableHost("https://x.com", "https://y.com")).toBe(false);
  });
});
