// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { WikiLinkCompletionProvider } from "./completionProvider";
import { WikiLinkDiagnosticManager } from "./diagnosticProvider";
import { WikiLinkHandler, WikiLinkProvider } from "./wikiLinkProvider";
import { FindReferencesProvider } from "./findReferencesProvider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "typst-oxide" is now active!');

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
  const referencesProviderDisposable = vscode.languages.registerReferenceProvider(
    { language: "typst" },
    findReferencesProvider
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

  context.subscriptions.push(
    disposable,
    linkProviderDisposable,
    completionProviderDisposable,
    referencesProviderDisposable,
    wikiLinkCommandDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
