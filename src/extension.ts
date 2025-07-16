// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { WikiLinkCompletionProvider } from "./completionProvider";
import { WikiLinkDiagnosticManager } from "./diagnosticProvider";
import { FindReferencesProvider } from "./findReferencesProvider";
import { LinkSidebarProvider } from "./linkSidebarProvider";
import { TemplateProvider } from "./templateProvider";
import { WikiLinkHandler, WikiLinkProvider } from "./wikiLinkProvider";
import { FileRenameManager } from "./fileRenameManager";
import { LabelSymbolProvider } from "./labelSymbolProvider";
import { LabelRenameProvider } from "./labelRenameProvider";
import { SettingsManager } from "./settings";

export function activate(context: vscode.ExtensionContext) {
  // Initialize settings manager
  const settingsManager = SettingsManager.getInstance();
  
  // Load settings
  settingsManager.loadSettings().catch(error => {
    console.error('Failed to load settings:', error);
  });

  // Register template provider
  const templateProvider = new TemplateProvider(context);
  templateProvider.register();

  // Register wiki link provider for .typ files
  const wikiLinkProvider = new WikiLinkProvider();
  const linkProviderDisposable = vscode.languages.registerDocumentLinkProvider(
    { language: "typst" },
    wikiLinkProvider
  );

  // Register completion provider for wiki links
  const completionProvider = new WikiLinkCompletionProvider();
  const completionProviderDisposable =
    vscode.languages.registerCompletionItemProvider(
      { language: "typst" },
      completionProvider,
      "[", // Trigger completion when '[' is typed
      ":" // Trigger completion when ':' is typed (for labels)
    );

  // Register diagnostic provider for wiki link validation
  const diagnosticManager = new WikiLinkDiagnosticManager();
  context.subscriptions.push(diagnosticManager);

  // Register find references provider for labels and headings
  const findReferencesProvider = new FindReferencesProvider();
  const referencesProviderDisposable =
    vscode.languages.registerReferenceProvider(
      { language: "typst" },
      findReferencesProvider
    );

  // Register context key for repository detection
  const repositoryContext = new RepositoryContext();

  // Register wiki links sidebar provider
  const linkSidebarProvider = new LinkSidebarProvider(context);
  vscode.window.registerTreeDataProvider(
    "typst-oxide.links",
    linkSidebarProvider
  );

  // Set initial repository context
  repositoryContext.updateRepositoryContext();

  // Register refresh links command
  const refreshLinksDisposable = vscode.commands.registerCommand(
    "typst-oxide.refreshLinks",
    () => {
      linkSidebarProvider.refresh();
    }
  );

  // Register command handler for custom wiki link navigation
  const wikiLinkCommandDisposable = vscode.commands.registerCommand(
    "typst-oxide.openWikiLink",
    async (args: any) => {
      try {
        const data = typeof args === "string" ? JSON.parse(args) : args;
        const uri = vscode.Uri.parse(data.uri);
        const label = data.label;
        await WikiLinkHandler.handleWikiLink(uri, label);
      } catch (error) {
        vscode.window.showErrorMessage("Failed to parse wiki link data");
      }
    }
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "typst-oxide.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from typst-oxide!");
    }
  );

  // Initialize repository command
  const initRepositoryDisposable = vscode.commands.registerCommand(
    "typst-oxide.initRepository",
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder is open");
          return;
        }

        const typstOxideDir = vscode.Uri.joinPath(
          workspaceFolder.uri,
          ".typst-oxide"
        );

        try {
          await vscode.workspace.fs.createDirectory(typstOxideDir);
          vscode.window.showInformationMessage(
            "Initialized typst-oxide repository"
          );
        } catch (error: any) {
          if (error.code === "FileExists") {
            vscode.window.showInformationMessage(
              "Typst-oxide repository already initialized"
            );
          } else {
            throw error;
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to initialize repository: ${error}`
        );
      }
    }
  );

  // Register manual link update command
  const updateLinksDisposable = vscode.commands.registerCommand(
    "typst-oxide.updateLinksForRename",
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder is open");
          return;
        }

        // Get the old file path
        const oldUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'Typst files': ['typ']
          },
          title: "Select the original file (before rename)"
        });

        if (!oldUri || oldUri.length === 0) {
          return;
        }

        // Get the new file path
        const newUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'Typst files': ['typ']
          },
          title: "Select the renamed file"
        });

        if (!newUri || newUri.length === 0) {
          return;
        }

        // Trigger manual update
        await fileRenameManager.triggerManualUpdate(oldUri[0], newUri[0]);

      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to update wiki links: ${error}`
        );
      }
    }
  );

  // Register label symbol provider for labels and headings
  const labelSymbolProvider = new LabelSymbolProvider();
  const labelSymbolDisposable = vscode.languages.registerDocumentSymbolProvider(
    { language: "typst" },
    labelSymbolProvider
  );

  // Register label rename provider
  const labelRenameProvider = new LabelRenameProvider();
  const labelRenameDisposable = vscode.languages.registerRenameProvider(
    { language: "typst" },
    labelRenameProvider
  );

  // Register file rename manager for automatic wiki link updates
  const fileRenameManager = new FileRenameManager(context);
  fileRenameManager.activate();

  // Register settings management commands
  const openSettingsDisposable = vscode.commands.registerCommand(
    "typst-oxide.openSettings",
    async () => {
      try {
        await settingsManager.openSettingsFile();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
      }
    }
  );

  const reloadSettingsDisposable = vscode.commands.registerCommand(
    "typst-oxide.reloadSettings",
    async () => {
      try {
        await settingsManager.reloadSettings();
        vscode.window.showInformationMessage("Settings reloaded");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to reload settings: ${error}`);
      }
    }
  );

  // Register tinymist.pinMain command to be invoked when active editor changes
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor && editor.document.languageId === "typst") {
        vscode.commands.executeCommand(
          "tinymist.pinMain",
          editor.document.uri.fsPath
        );
      }
    }
  );

  context.subscriptions.push(
    disposable,
    linkProviderDisposable,
    completionProviderDisposable,
    referencesProviderDisposable,
    wikiLinkCommandDisposable,
    refreshLinksDisposable,
    initRepositoryDisposable,
    updateLinksDisposable,
    fileRenameManager,
    labelSymbolDisposable,
    labelRenameDisposable,
    activeEditorListener,
    openSettingsDisposable,
    reloadSettingsDisposable,
    settingsManager
  );
}

// Repository context manager
class RepositoryContext {
  private _repositoryExists = false;

  constructor() {
    // Listen for file system changes to detect repository initialization
    const watcher = vscode.workspace.createFileSystemWatcher("**/.typst-oxide");
    watcher.onDidCreate(() => this.updateRepositoryContext());
    watcher.onDidDelete(() => this.updateRepositoryContext());

    // Also listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() =>
      this.updateRepositoryContext()
    );
  }

  async updateRepositoryContext(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      await this.setContext(false);
      return;
    }

    try {
      const typstOxideDir = vscode.Uri.joinPath(
        workspaceFolder.uri,
        ".typst-oxide"
      );
      await vscode.workspace.fs.stat(typstOxideDir);
      await this.setContext(true);
    } catch {
      await this.setContext(false);
    }
  }

  private async setContext(value: boolean): Promise<void> {
    if (this._repositoryExists !== value) {
      this._repositoryExists = value;
      await vscode.commands.executeCommand(
        "setContext",
        "typst-oxide.repositoryExists",
        value
      );
    }
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
