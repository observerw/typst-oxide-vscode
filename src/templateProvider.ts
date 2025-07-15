import { Eta } from "eta";
import * as fs from "fs/promises";
import * as vscode from "vscode";
export class TemplateProvider {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async applyTemplate(fileUri: vscode.Uri) {
    if (!fileUri.path.endsWith(".typ")) {
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
      return;
    }

    const stats = await fs.stat(fileUri.fsPath);
    if (stats.size > 0) {
      return;
    }

    try {
      const eta = new Eta({
        views: vscode.Uri.joinPath(workspaceFolder.uri, "templates").fsPath,
      });
      const renderedContent = eta.render("default.typ.eta", {
        date: new Date(),
        stats: stats,
        path: fileUri.path,
      });
      console.log(renderedContent);

      if (renderedContent) {
        await vscode.workspace.fs.writeFile(
          fileUri,
          Buffer.from(renderedContent, "utf-8")
        );
      }
    } catch (error) {
      console.log(error);

      // Template not found or other error, ignore.
    }
  }

  register() {
    this.context.subscriptions.push(
      vscode.workspace.onDidCreateFiles(async (event) => {
        for (const file of event.files) {
          await this.applyTemplate(file);
        }
      })
    );
  }
}
