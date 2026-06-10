import type { Browser, BrowserContext, Page, Response as PWResponse } from "playwright";
import type {
  AnalyzeOptions,
  HttpMethod,
  ObservedRequest,
  ProgressReporter
} from "./types";
import { normalizeUrl, safeParseUrl, sameRegistrableHost, isStaticAsset } from "./urlUtils";

export interface DynamicResult {
  observed: ObservedRequest[];
  pagesVisited: number;
  available: boolean;
  error?: string;
}

const CAPTURED_BODY_TYPES = /(json|text|xml|graphql|x-www-form-urlencoded|javascript)/i;
const MAX_BODY_SAMPLE = 4000;

type PlaywrightModule = typeof import("playwright");

/** Attempt to load Playwright; returns undefined if not installed/usable. */
export async function loadPlaywright(): Promise<PlaywrightModule | undefined> {
  try {
    // Indirect import so bundlers keep it external and failure is graceful.
    const mod = (await import("playwright")) as PlaywrightModule;
    return mod;
  } catch {
    return undefined;
  }
}

function toHttpMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  const known: HttpMethod[] = [
    "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"
  ];
  return (known.includes(upper as HttpMethod) ? upper : "GET") as HttpMethod;
}

async function captureResponse(
  response: PWResponse,
  fromPage: string,
  observed: ObservedRequest[]
): Promise<void> {
  try {
    const request = response.request();
    const resourceType = request.resourceType();
    const url = response.url();
    if (!/^https?:|^wss?:/i.test(url)) {
      return;
    }
    const headers = await safeResponseHeaders(response);
    const contentType = headers["content-type"] ?? "";

    let responseSample: string | undefined;
    if (CAPTURED_BODY_TYPES.test(contentType)) {
      try {
        const body = await response.text();
        responseSample = body.slice(0, MAX_BODY_SAMPLE);
      } catch {
        /* body not available */
      }
    }

    observed.push({
      url,
      method: toHttpMethod(request.method()),
      resourceType,
      requestHeaders: request.headers(),
      requestBody: request.postData() ?? undefined,
      status: response.status(),
      statusText: response.statusText(),
      responseHeaders: headers,
      responseContentType: contentType,
      responseSample,
      source: "dynamic",
      fromPage
    });
  } catch {
    /* ignore individual capture failures */
  }
}

async function safeResponseHeaders(response: PWResponse): Promise<Record<string, string>> {
  try {
    return await response.allHeaders();
  } catch {
    try {
      return response.headers();
    } catch {
      return {};
    }
  }
}

async function autoScroll(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let total = 0;
        const step = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight || total > 8000) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });
  } catch {
    /* scrolling is best-effort */
  }
}

async function collectLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const hrefs = await page.$$eval("a[href]", (els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
    );
    const out = new Set<string>();
    for (const href of hrefs) {
      const abs = normalizeUrl(href, baseUrl);
      if (abs && !isStaticAsset(abs)) {
        out.add(abs);
      }
    }
    return Array.from(out);
  } catch {
    return [];
  }
}

/** Drive a headless browser to capture live network traffic across crawled pages. */
export async function dynamicAnalyze(
  options: AnalyzeOptions,
  reporter: ProgressReporter,
  shouldStop?: () => boolean
): Promise<DynamicResult> {
  const observed: ObservedRequest[] = [];
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      observed,
      pagesVisited: 0,
      available: false,
      error: "Playwright is not installed."
    };
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let pagesVisited = 0;
  try {
    browser = await pw.chromium.launch({ headless: options.headless });
    context = await browser.newContext({
      extraHTTPHeaders:
        Object.keys(options.extraHeaders).length > 0 ? options.extraHeaders : undefined,
      ignoreHTTPSErrors: true
    });

    const startOrigin = safeParseUrl(options.startUrl);
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [
      { url: options.startUrl, depth: 0 }
    ];

    while (queue.length > 0 && pagesVisited < options.maxPages) {
      if (shouldStop?.()) {
        reporter.log("[dynamic] stopped by user");
        break;
      }
      const { url, depth } = queue.shift()!;
      const canonical = url.split("#")[0];
      if (visited.has(canonical)) {
        continue;
      }
      visited.add(canonical);

      const page = await context.newPage();
      const onResponse = (response: PWResponse) =>
        void captureResponse(response, canonical, observed);
      page.on("response", onResponse);

      try {
        reporter.log(`[dynamic] visiting (${pagesVisited + 1}/${options.maxPages}) ${canonical}`);
        await page.goto(canonical, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: options.waitMs + 2000 });
        } catch {
          /* networkidle may never settle */
        }
        await autoScroll(page);
        if (options.waitMs > 0) {
          await page.waitForTimeout(options.waitMs);
        }

        pagesVisited += 1;

        if (depth < options.maxDepth && startOrigin) {
          const links = await collectLinks(page, canonical);
          for (const link of links) {
            if (
              !visited.has(link.split("#")[0]) &&
              sameRegistrableHost(link, options.startUrl)
            ) {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }
      } catch (err) {
        reporter.log(`[dynamic] error on ${canonical}: ${(err as Error).message}`);
      } finally {
        page.off("response", onResponse);
        await page.close().catch(() => undefined);
      }
    }

    return { observed, pagesVisited, available: true };
  } catch (err) {
    return {
      observed,
      pagesVisited,
      available: true,
      error: (err as Error).message
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
