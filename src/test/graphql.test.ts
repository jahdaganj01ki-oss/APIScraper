import { describe, it, expect } from "vitest";
import { INTROSPECTION_QUERY, summarizeIntrospection } from "../core/graphql";

describe("graphql introspection", () => {
  it("builds a valid-looking introspection query", () => {
    expect(INTROSPECTION_QUERY).toContain("__schema");
    expect(INTROSPECTION_QUERY).toContain("queryType");
  });

  it("summarizes root query and mutation fields", () => {
    const json = {
      data: {
        __schema: {
          queryType: { name: "Query" },
          mutationType: { name: "Mutation" },
          subscriptionType: null,
          types: [
            { kind: "OBJECT", name: "Query", fields: [{ name: "users" }, { name: "user" }] },
            { kind: "OBJECT", name: "Mutation", fields: [{ name: "createUser" }] }
          ]
        }
      }
    };
    expect(summarizeIntrospection(json)).toEqual([
      "query users",
      "query user",
      "mutation createUser"
    ]);
  });

  it("accepts a schema without the data wrapper", () => {
    const json = {
      __schema: {
        queryType: { name: "Query" },
        types: [{ name: "Query", fields: [{ name: "ping" }] }]
      }
    };
    expect(summarizeIntrospection(json)).toEqual(["query ping"]);
  });

  it("returns empty for non-introspection payloads", () => {
    expect(summarizeIntrospection({ errors: [{ message: "nope" }] })).toEqual([]);
    expect(summarizeIntrospection("garbage")).toEqual([]);
    expect(summarizeIntrospection(undefined)).toEqual([]);
  });
});
