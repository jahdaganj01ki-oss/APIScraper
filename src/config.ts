import * as vscode from "vscode";
import type { AnalyzeOptions } from "./core/types";

/** Read extension settings and merge with a start URL into AnalyzeOptions. */
export function readOptions(startUrl: string): AnalyzeOptions {
  const cfg = vscode.workspace.getConfiguration("apiscraper");
  const extraHeaders = cfg.get<Record<string, string>>("extraHeaders", {}) ?? {};
  return {
    startUrl,
    maxDepth: cfg.get<number>("crawl.maxDepth", 1),
    maxPages: cfg.get<number>("crawl.maxPages", 15),
    dynamicEnabled: cfg.get<boolean>("dynamic.enabled", true),
    headless: cfg.get<boolean>("dynamic.headless", true),
    waitMs: cfg.get<number>("dynamic.waitMs", 3500),
    includeThirdParty: cfg.get<boolean>("includeThirdParty", true),
    includeStaticAssets: cfg.get<boolean>("includeStaticAssets", false),
    extraHeaders: typeof extraHeaders === "object" ? extraHeaders : {},
    storageStatePath: cfg.get<string>("dynamic.storageState", "") || undefined,
    respectRobots: cfg.get<boolean>("crawl.respectRobots", true),
    crawlDelayMs: cfg.get<number>("crawl.delayMs", 250),
    graphqlIntrospection: cfg.get<boolean>("graphql.introspection", true)
  };
}
