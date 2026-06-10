import * as vscode from "vscode";
import { ApiScraperPanel } from "./panel/apiScraperPanel";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("apiscraper.open", () => {
      ApiScraperPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("apiscraper.analyze", async () => {
      const url = await vscode.window.showInputBox({
        title: "APIScraper – Analyze Website",
        prompt: "Enter the website URL to analyze",
        placeHolder: "https://example.com",
        validateInput: (value) => {
          const v = value.trim();
          if (!v) {
            return "Please enter a URL";
          }
          try {
            new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
            return undefined;
          } catch {
            return "Not a valid URL";
          }
        }
      });
      if (!url) {
        return;
      }
      const panel = ApiScraperPanel.createOrShow(context.extensionUri);
      panel.startAnalysis(url);
    })
  );
}

export function deactivate(): void {
  ApiScraperPanel.current?.dispose();
}
