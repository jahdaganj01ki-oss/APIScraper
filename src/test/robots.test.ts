import { describe, it, expect } from "vitest";
import { makeRobotsChecker, parseRobotsRules } from "../core/robots";

describe("robots.txt parsing", () => {
  it("parses rules for the wildcard agent", () => {
    const rules = parseRobotsRules(
      ["User-agent: *", "Disallow: /admin", "Allow: /admin/public"].join("\n")
    );
    expect(rules).toEqual([
      { allow: false, path: "/admin" },
      { allow: true, path: "/admin/public" }
    ]);
  });

  it("disallows matching paths", () => {
    const allowed = makeRobotsChecker("User-agent: *\nDisallow: /admin");
    expect(allowed("/admin/users")).toBe(false);
    expect(allowed("/public")).toBe(true);
  });

  it("lets a more specific Allow override a Disallow", () => {
    const allowed = makeRobotsChecker(
      "User-agent: *\nDisallow: /admin\nAllow: /admin/public"
    );
    expect(allowed("/admin/public/page")).toBe(true);
    expect(allowed("/admin/secret")).toBe(false);
  });

  it("treats empty Disallow as allow-all", () => {
    const allowed = makeRobotsChecker("User-agent: *\nDisallow:");
    expect(allowed("/anything")).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    const allowed = makeRobotsChecker("User-agent: *\nDisallow: /*.json$");
    expect(allowed("/data/file.json")).toBe(false);
    expect(allowed("/data/file.json?x=1")).toBe(true);
  });

  it("prefers the agent-specific group over the wildcard group", () => {
    const text = [
      "User-agent: *",
      "Disallow: /",
      "User-agent: apiscraper",
      "Disallow: /private"
    ].join("\n");
    const allowed = makeRobotsChecker(text, "apiscraper");
    expect(allowed("/public")).toBe(true);
    expect(allowed("/private")).toBe(false);
  });

  it("allows everything when robots.txt has no rules", () => {
    const allowed = makeRobotsChecker("# nothing here");
    expect(allowed("/x")).toBe(true);
  });
});
