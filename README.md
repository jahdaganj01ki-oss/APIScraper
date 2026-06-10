# APIScraper

> Autonomously discover and analyze **all** the APIs / endpoints a website uses — right inside VS Code.

APIScraper drives a headless browser to capture live network traffic, statically mines the
page's JavaScript bundles, and probes well-known spec endpoints. It then normalizes everything
into a clean, grouped list of endpoints and lets you export to **OpenAPI 3.1**, **Postman**,
**HAR** or raw **JSON** — all from a single panel.

## Features

- **Dynamic capture (Playwright/Chromium)** — loads the page, records every `fetch`/XHR/
  WebSocket request, auto-scrolls and crawls internal links up to a configurable depth.
- **Static analysis** — downloads the HTML + JS bundles and extracts `fetch` / `axios` /
  `XMLHttpRequest` calls, URL/path literals, and GraphQL operations.
- **Well-known probes** — `robots.txt`, `sitemap.xml`, `/openapi.json`, `/swagger.json`,
  `/v2/api-docs`, GraphQL endpoints, and more.
- **Smart normalization** — groups requests by host + **path template** (`/users/{id}`),
  merges HTTP methods, infers query/path/body params and types, keeps sample requests/responses.
- **Exports** — OpenAPI 3.1, Postman collection v2.1, HAR 1.2, and raw JSON.
- **Graceful fallback** — if the browser isn't available, it automatically degrades to
  static-only analysis.

## Usage

1. Run **`APIScraper: Open Analyzer Panel`** (or **`APIScraper: Analyze Website…`**) from the
   Command Palette (`Ctrl+Shift+P`).
2. Enter a URL and click **Analyze**.
3. Browse the discovered endpoints, then export to your preferred format.

> The first dynamic run needs a Chromium browser. Install it once with:
> ```bash
> npx playwright install chromium
> ```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `apiscraper.crawl.maxDepth` | `1` | Link levels to crawl from the start URL. |
| `apiscraper.crawl.maxPages` | `15` | Max pages to visit during dynamic crawling. |
| `apiscraper.dynamic.enabled` | `true` | Use a headless browser to capture live traffic. |
| `apiscraper.dynamic.headless` | `true` | Run the browser headless. |
| `apiscraper.dynamic.waitMs` | `3500` | Wait per page for lazy requests (ms). |
| `apiscraper.includeThirdParty` | `true` | Include requests to third-party hosts. |
| `apiscraper.includeStaticAssets` | `false` | Include images/fonts/css in the results. |
| `apiscraper.extraHeaders` | `{}` | Extra headers (e.g. `Authorization`) for every request. |

## Development

```bash
npm install
npm run watch       # esbuild in watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # production bundle -> dist/extension.js
```

Press <kbd>F5</kbd> in VS Code to launch the **Extension Development Host**.

### Architecture

Pure logic (parsing, normalization, OpenAPI/Postman/HAR generation) lives under
[`src/core`](src/core) and never imports `vscode`, so it is unit-tested in plain Node.
The VS Code layer ([`src/extension.ts`](src/extension.ts), [`src/panel`](src/panel)) only
wires up commands and the webview.

## License

MIT — see [LICENSE](LICENSE).
