import type {
  AnalysisResult,
  AnalyzeOptions,
  ObservedRequest,
  ProgressReporter
} from "./types";
import { buildEndpoints } from "./endpointStore";
import { dynamicAnalyze } from "./dynamicAnalyzer";
import { staticAnalyze } from "./staticAnalyzer";
import { probeWellKnown } from "./wellKnown";
import { safeParseUrl } from "./urlUtils";

export interface AnalyzeRunOptions {
  reporter: ProgressReporter;
  shouldStop?: () => boolean;
}

/** Run the full multi-strategy analysis and return normalized endpoints. */
export async function analyzeWebsite(
  options: AnalyzeOptions,
  run: AnalyzeRunOptions
): Promise<AnalysisResult> {
  const { reporter } = run;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const warnings: string[] = [];

  if (!safeParseUrl(options.startUrl)) {
    throw new Error(`Invalid URL: ${options.startUrl}`);
  }

  const observed: ObservedRequest[] = [];
  let dynamicUsed = false;
  let staticUsed = false;
  let pagesVisited = 0;

  reporter.setPhase?.("Probing well-known endpoints");
  try {
    const wk = await probeWellKnown(options.startUrl, options.extraHeaders, reporter);
    observed.push(...wk);
  } catch (err) {
    warnings.push(`Well-known probe failed: ${(err as Error).message}`);
  }

  if (options.dynamicEnabled) {
    reporter.setPhase?.("Dynamic browser capture");
    const dyn = await dynamicAnalyze(options, reporter, run.shouldStop);
    pagesVisited = dyn.pagesVisited;
    if (dyn.available) {
      dynamicUsed = true;
      observed.push(...dyn.observed);
      if (dyn.error) {
        warnings.push(`Dynamic analysis warning: ${dyn.error}`);
      }
    } else {
      warnings.push(
        "Playwright browser not available — fell back to static analysis. " +
          "Run `npx playwright install chromium` to enable dynamic capture."
      );
    }
  }

  if (!dynamicUsed || observed.filter((o) => o.source === "dynamic").length === 0) {
    reporter.setPhase?.("Static source analysis");
    try {
      const stat = await staticAnalyze(options, reporter);
      observed.push(...stat);
      staticUsed = true;
    } catch (err) {
      warnings.push(`Static analysis failed: ${(err as Error).message}`);
    }
  } else {
    // Always complement dynamic with static extraction of the start page.
    reporter.setPhase?.("Static source analysis");
    try {
      const stat = await staticAnalyze(options, reporter);
      observed.push(...stat);
      staticUsed = true;
    } catch (err) {
      warnings.push(`Static analysis failed: ${(err as Error).message}`);
    }
  }

  reporter.setPhase?.("Normalizing endpoints");
  const endpoints = buildEndpoints(observed, options);

  return {
    startUrl: options.startUrl,
    startedAt,
    endpoints,
    stats: {
      pagesVisited,
      requestsObserved: observed.length,
      endpoints: endpoints.length,
      dynamicUsed,
      staticUsed,
      durationMs: Date.now() - t0,
      warnings
    }
  };
}
