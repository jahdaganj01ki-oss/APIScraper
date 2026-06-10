import * as vscode from "vscode";
import { analyzeWebsite } from "../core/analyzer";
import type { AnalysisResult, AnalyzeOptions, ProgressReporter } from "../core/types";
import { generateOpenApi } from "../core/export/openapi";
import { generatePostmanCollection } from "../core/export/postman";
import { generateHar } from "../core/export/har";
import { readOptions } from "../config";
import { getWebviewHtml } from "./webviewContent";

type ExportFormat = "openapi" | "postman" | "har" | "json";

interface InboundMessage {
  type: "ready" | "analyze" | "stop" | "export";
  url?: string;
  overrides?: Partial<AnalyzeOptions>;
  format?: ExportFormat;
}

export class ApiScraperPanel {
  public static current: ApiScraperPanel | undefined;
  private static readonly viewType = "apiscraper.panel";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private running = false;
  private stopRequested = false;
  private lastResult: AnalysisResult | undefined;

  public static createOrShow(extensionUri: vscode.Uri): ApiScraperPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ApiScraperPanel.current) {
      ApiScraperPanel.current.panel.reveal(column);
      return ApiScraperPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      ApiScraperPanel.viewType,
      "APIScraper",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
      }
    );
    ApiScraperPanel.current = new ApiScraperPanel(panel, extensionUri);
    return ApiScraperPanel.current;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: InboundMessage) => this.onMessage(msg),
      null,
      this.disposables
    );
  }

  /** Programmatically start an analysis (used by the analyze command). */
  public startAnalysis(url: string): void {
    this.panel.reveal();
    void this.runAnalysis(url, {});
  }

  private async onMessage(msg: InboundMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        return;
      case "analyze":
        if (msg.url) {
          await this.runAnalysis(msg.url, msg.overrides ?? {});
        }
        return;
      case "stop":
        this.stopRequested = true;
        return;
      case "export":
        if (msg.format) {
          await this.exportResult(msg.format);
        }
        return;
    }
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private async runAnalysis(
    rawUrl: string,
    overrides: Partial<AnalyzeOptions>
  ): Promise<void> {
    if (this.running) {
      vscode.window.showWarningMessage("APIScraper is already running.");
      return;
    }
    const url = normalizeInputUrl(rawUrl);
    if (!url) {
      this.post({ type: "error", message: `Invalid URL: ${rawUrl}` });
      return;
    }

    this.running = true;
    this.stopRequested = false;
    this.post({ type: "started" });

    const options: AnalyzeOptions = { ...readOptions(url), ...overrides, startUrl: url };
    const reporter: ProgressReporter = {
      log: (line: string) => this.post({ type: "log", line }),
      setPhase: (phase: string) => this.post({ type: "phase", phase })
    };

    try {
      const result = await analyzeWebsite(options, {
        reporter,
        shouldStop: () => this.stopRequested
      });
      this.lastResult = result;
      this.post({ type: "result", result });
    } catch (err) {
      this.post({ type: "error", message: (err as Error).message });
    } finally {
      this.running = false;
      this.post({ type: "finished" });
    }
  }

  private async exportResult(format: ExportFormat): Promise<void> {
    if (!this.lastResult) {
      vscode.window.showWarningMessage("Nothing to export yet — run an analysis first.");
      return;
    }
    const { content, ext, label } = serializeExport(format, this.lastResult);
    const host = safeHost(this.lastResult.startUrl);
    const uri = await vscode.window.showSaveDialog({
      saveLabel: `Save ${label}`,
      filters: { [label]: [ext] },
      defaultUri: defaultExportUri(`apiscraper-${host}.${ext}`)
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    const open = await vscode.window.showInformationMessage(
      `APIScraper: exported ${label} to ${uri.fsPath}`,
      "Open"
    );
    if (open === "Open") {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  }

  public dispose(): void {
    ApiScraperPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function serializeExport(
  format: ExportFormat,
  result: AnalysisResult
): { content: string; ext: string; label: string } {
  switch (format) {
    case "openapi":
      return {
        content: JSON.stringify(generateOpenApi(result), null, 2),
        ext: "json",
        label: "OpenAPI"
      };
    case "postman":
      return {
        content: JSON.stringify(generatePostmanCollection(result), null, 2),
        ext: "json",
        label: "Postman Collection"
      };
    case "har":
      return {
        content: JSON.stringify(generateHar(result), null, 2),
        ext: "har",
        label: "HAR"
      };
    case "json":
    default:
      return {
        content: JSON.stringify(result, null, 2),
        ext: "json",
        label: "JSON"
      };
  }
}

function normalizeInputUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return undefined;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return "site";
  }
}

function defaultExportUri(fileName: string): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    return vscode.Uri.joinPath(folder.uri, fileName);
  }
  return undefined;
}
