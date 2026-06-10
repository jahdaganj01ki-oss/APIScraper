import * as vscode from "vscode";

function nonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "panel.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "panel.css")
  );
  const n = nonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}'`,
    `font-src ${webview.cspSource}`
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>APIScraper</title>
</head>
<body>
  <header class="bar">
    <div class="brand">APIScraper</div>
    <div class="row">
      <input id="url" type="text" placeholder="https://example.com" spellcheck="false" />
      <button id="analyze" class="primary">Analyze</button>
      <button id="stop" disabled>Stop</button>
    </div>
  </header>

  <section class="options">
    <label><input type="checkbox" id="opt-dynamic" checked /> Dynamic (browser)</label>
    <label><input type="checkbox" id="opt-thirdparty" checked /> Third-party hosts</label>
    <label><input type="checkbox" id="opt-assets" /> Static assets</label>
    <label>Depth <input type="number" id="opt-depth" min="0" max="5" value="1" /></label>
    <label>Max pages <input type="number" id="opt-maxpages" min="1" max="200" value="15" /></label>
  </section>

  <section id="status" class="status hidden">
    <div class="phase"><span id="phase">Idle</span><span id="spinner" class="spinner"></span></div>
    <pre id="logs" class="logs"></pre>
  </section>

  <section id="summary" class="summary hidden"></section>

  <section class="toolbar hidden" id="toolbar">
    <input id="filter" type="text" placeholder="Filter endpoints…" />
    <span class="grow"></span>
    <button data-export="openapi">Export OpenAPI</button>
    <button data-export="postman">Export Postman</button>
    <button data-export="har">Export HAR</button>
    <button data-export="json">Export JSON</button>
  </section>

  <main id="results"></main>

  <div id="empty" class="empty">
    <p>Enter a URL and click <strong>Analyze</strong> to autonomously discover its APIs &amp; endpoints.</p>
  </div>

  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}
