import * as vscode from "vscode";

class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private level: "off" | "messages" | "verbose" = "off";

  initialize(context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("Sass Prefix Resolver");
    context.subscriptions.push(this.outputChannel);
    this.updateLevel();

    // 設定変更を監視
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("sassPrefixResolver.trace.server")) {
        this.updateLevel();
      }
    });
  }

  private updateLevel() {
    const config = vscode.workspace.getConfiguration("sassPrefixResolver");
    this.level = config.get("trace.server", "off");
  }

  private shouldLog(level: "messages" | "verbose"): boolean {
    if (this.level === "off") return false;
    if (this.level === "messages") return level === "messages";
    return true; // verbose
  }

  info(message: string) {
    if (this.shouldLog("messages") && this.outputChannel) {
      this.outputChannel.appendLine(`[INFO] ${message}`);
    }
  }

  debug(message: string) {
    if (this.shouldLog("verbose") && this.outputChannel) {
      this.outputChannel.appendLine(`[DEBUG] ${message}`);
    }
  }

  error(message: string, error?: Error) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[ERROR] ${message}`);
      if (error) {
        this.outputChannel.appendLine(error.stack || error.message);
      }
    }
  }

  show() {
    this.outputChannel?.show();
  }
}

export const logger = new Logger();
