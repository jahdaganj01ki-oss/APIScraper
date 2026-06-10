import { describe, it, expect } from "vitest";
import {
  extractCandidatesFromSource,
  extractScriptUrls
} from "../core/staticAnalyzer";

describe("extractCandidatesFromSource", () => {
  it("extracts fetch calls", () => {
    const src = `const r = await fetch("/api/users?active=true");`;
    const cands = extractCandidatesFromSource(src);
    expect(cands.some((c) => c.raw === "/api/users?active=true")).toBe(true);
  });

  it("extracts axios method calls with method", () => {
    const src = `axios.post('https://api.example.com/v1/login', data)`;
    const cands = extractCandidatesFromSource(src);
    const hit = cands.find((c) => c.raw === "https://api.example.com/v1/login");
    expect(hit).toBeTruthy();
    expect(hit?.method).toBe("POST");
  });

  it("extracts XHR open calls", () => {
    const src = `xhr.open("PUT", "/api/items/42")`;
    const cands = extractCandidatesFromSource(src);
    const hit = cands.find((c) => c.raw === "/api/items/42");
    expect(hit?.method).toBe("PUT");
  });

  it("extracts url props and absolute urls", () => {
    const src = `$.ajax({ url: "/rest/data" }); const u = "https://cdn.x.com/api/v2/feed";`;
    const cands = extractCandidatesFromSource(src);
    expect(cands.some((c) => c.raw === "/rest/data")).toBe(true);
    expect(cands.some((c) => c.raw === "https://cdn.x.com/api/v2/feed")).toBe(true);
  });

  it("extracts api-ish path literals", () => {
    const src = `const path = "/api/v3/orders/{orderId}";`;
    const cands = extractCandidatesFromSource(src);
    expect(cands.some((c) => c.raw.startsWith("/api/v3/orders"))).toBe(true);
  });

  it("ignores irrelevant strings", () => {
    const src = `const label = "hello world"; const css = "/style.css is here";`;
    const cands = extractCandidatesFromSource(src);
    expect(cands.length).toBe(0);
  });
});

describe("extractScriptUrls", () => {
  it("finds js bundle urls", () => {
    const html = `<script src="/static/app.js"></script><script src="https://cdn.x.com/v.min.js"></script>`;
    const urls = extractScriptUrls(html, "https://site.com/");
    expect(urls).toContain("https://site.com/static/app.js");
    expect(urls).toContain("https://cdn.x.com/v.min.js");
  });
});
