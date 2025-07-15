import * as vscode from "vscode";
import { LabelSearcher } from "./utils/labelSearcher";
import { PathResolver } from "./utils/pathResolver";

export interface WikiLink {
  filePath: string;
  label: string;
  alias: string;
  range: vscode.Range;
}

export class WikiLinkProvider implements vscode.DocumentLinkProvider {
  // Regex to match wiki links: [[path/to/file]] or [[path/to/file:<label>]] or [[path/to/file:<label>|<alias>]]
  private static readonly WIKI_LINK_REGEX = /\[\[([^|\]]+?)(?::([^|\]]+?))?(?:\|([^\]]+))?\]\]/g;

  /**
   * Provides document links for wiki links in .typ files
   */
  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();

    let match;
    WikiLinkProvider.WIKI_LINK_REGEX.lastIndex = 0; // Reset regex

    while ((match = WikiLinkProvider.WIKI_LINK_REGEX.exec(text)) !== null) {
      if (token.isCancellationRequested) {
        break;
      }

      const filePath = match[1].trim();
      const label = match[2] ? match[2].trim() : undefined;
      const alias = match[3] ? match[3].trim() : undefined;

      // Create range for the entire wiki link
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      // Resolve the target file path
      const filePathWithExt = PathResolver.ensureTypstExtension(filePath);
      const targetUri = PathResolver.resolveFilePath(
        document.uri,
        filePathWithExt
      );

      // Create a document link using a command URI to handle navigation
      // This ensures our custom handler is called instead of default file opening
      const commandUri = vscode.Uri.parse(
        `command:typst-oxide.openWikiLink?${encodeURIComponent(
          JSON.stringify({
            uri: targetUri.toString(),
            label: label || "",
          })
        )}`
      );
      const link = new vscode.DocumentLink(range, commandUri);

      link.tooltip = label
        ? `Navigate to "${label}" in ${PathResolver.getWorkspaceRelativePath(
            targetUri
          )}`
        : `Navigate to ${PathResolver.getWorkspaceRelativePath(targetUri)}`;
      
      // Update the link text to show alias if provided
      if (alias) {
        link.tooltip = `Navigate to "${label || PathResolver.getWorkspaceRelativePath(targetUri)}" (shown as "${alias}")`;
      }

      links.push(link);
    }

    return links;
  }

  /**
   * Parses wiki links from document text
   */
  static parseWikiLinks(document: vscode.TextDocument): WikiLink[] {
    const links: WikiLink[] = [];
    const text = document.getText();

    let match;
    WikiLinkProvider.WIKI_LINK_REGEX.lastIndex = 0;

    while ((match = WikiLinkProvider.WIKI_LINK_REGEX.exec(text)) !== null) {
      const filePath = match[1].trim();
      const label = match[2] ? match[2].trim() : "";

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      links.push({
        filePath,
        label,
        alias: match[3] ? match[3].trim() : "",
        range,
      });
    }

    return links;
  }
}

export class WikiLinkHandler {
  /**
   * Handles wiki link navigation
   */
  static async handleWikiLink(uri: vscode.Uri, label?: string): Promise<void> {
    try {
      const filePath = uri.fsPath || uri.path;
      const targetLabel = label || uri.fragment;

      if (!filePath) {
        vscode.window.showErrorMessage("Invalid wiki link format");
        return;
      }

      const targetUri = vscode.Uri.file(filePath);

      // Check if file exists
      const fileExists = await PathResolver.fileExists(targetUri);
      if (!fileExists) {
        const relativePath = PathResolver.getWorkspaceRelativePath(targetUri);
        const create = await vscode.window.showErrorMessage(
          `📄 File not found: "${relativePath}"`,
          {
            modal: false,
            detail: `The linked file "${relativePath}" doesn't exist in your workspace. Would you like to create it?`,
          },
          "Create File",
          "Cancel"
        );

        if (create === "Create File") {
          await this.createNewFile(targetUri, label);
        }
        return;
      }

      // Open the document
      const document = await vscode.workspace.openTextDocument(targetUri);

      // Navigate to the label only if one is specified
      if (targetLabel && targetLabel.trim() !== "") {
        const success = await LabelSearcher.navigateToLabel(
          document,
          targetLabel
        );

        if (!success) {
          const relativePath = PathResolver.getWorkspaceRelativePath(targetUri);
          const addLabel = await vscode.window.showWarningMessage(
            `🔍 Label "${label}" not found in "${relativePath}"`,
            {
              modal: false,
              detail: `The label "${label}" doesn't exist in the target file. The file will still be opened.`,
            },
            "Add Label",
            "OK"
          );

          if (addLabel === "Add Label") {
            await this.addLabelToFile(document, targetLabel);
          }
        }
      } else {
        // No label specified, just open the file
        await vscode.window.showTextDocument(document);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`❌ Failed to navigate to wiki link`, {
        modal: false,
        detail: `An error occurred while trying to open the linked file: ${errorMessage}`,
      });
    }
  }

  /**
   * Creates a new file with basic content and optionally adds a label
   */
  private static async createNewFile(
    uri: vscode.Uri,
    label?: string
  ): Promise<void> {
    try {
      const fileName =
        uri.path.split("/").pop()?.replace(".typ", "") || "Untitled";
      let content = `= ${fileName}\n\n`;

      // If a label was provided, add it as a comment
      if (label) {
        content += `// ${label}\n\n`;
      }

      content += `// Add your content here\n`;

      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);

      vscode.window.showInformationMessage(
        `✅ Created new file: "${fileName}.typ"`,
        {
          modal: false,
          detail: label
            ? `Added label "${label}" as a comment in the new file.`
            : undefined,
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`❌ Failed to create file`, {
        modal: false,
        detail: `Could not create the new file: ${errorMessage}`,
      });
    }
  }

  /**
   * Adds a label to an existing file
   */
  private static async addLabelToFile(
    document: vscode.TextDocument,
    label: string
  ): Promise<void> {
    try {
      const editor = await vscode.window.showTextDocument(document);

      // Add the label as a comment at the end of the document
      const lastLine = document.lineCount - 1;
      const endPosition = new vscode.Position(
        lastLine,
        document.lineAt(lastLine).text.length
      );

      const labelComment = `\n\n// ${label}\n`;

      await editor.edit((editBuilder) => {
        editBuilder.insert(endPosition, labelComment);
      });

      // Move cursor to the new label
      const newPosition = new vscode.Position(lastLine + 2, 3 + label.length);
      editor.selection = new vscode.Selection(newPosition, newPosition);
      editor.revealRange(
        new vscode.Range(newPosition, newPosition),
        vscode.TextEditorRevealType.InCenter
      );

      vscode.window.showInformationMessage(
        `✅ Added label "${label}" to the file`,
        {
          modal: false,
          detail:
            "The label has been added as a comment at the end of the file.",
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`❌ Failed to add label`, {
        modal: false,
        detail: `Could not add the label to the file: ${errorMessage}`,
      });
    }
  }
}
