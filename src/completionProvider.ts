import * as path from "path";
import * as vscode from "vscode";
import { PathResolver } from "./utils/pathResolver";

export class WikiLinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const linePrefix = document
      .lineAt(position)
      .text.substring(0, position.character);

    // Check if we're in a wiki link context
    const wikiLinkMatch = linePrefix.match(/\[\[([^:]*?)(?::([^\]]*?))?$/);
    if (!wikiLinkMatch) {
      return [];
    }

    const filePath = wikiLinkMatch[1];
    const partialLabel = wikiLinkMatch[2] || "";

    // If we have a colon in the line, we're looking for labels
    if (linePrefix.includes(":")) {
      return this.provideLabelCompletions(
        document,
        filePath + ":" + partialLabel,
        token
      );
    }

    // Otherwise, provide file path completions
    return this.provideFilePathCompletions(document, filePath, token);
  }

  /**
   * Provides completion items for file paths
   */
  private async provideFilePathCompletions(
    document: vscode.TextDocument,
    partialPath: string,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const completions: vscode.CompletionItem[] = [];

    try {
      // Get the current document's directory
      const currentDir = path.dirname(document.uri.fsPath);

      // Determine the search directory based on partial path
      let searchDir: string;
      let searchPattern: string;

      if (partialPath.includes("/") || partialPath.includes("\\")) {
        // If partial path contains directory separators
        const pathParts = partialPath.split(/[/\\]/);
        searchPattern = pathParts.pop() || "";
        const dirPath = pathParts.join(path.sep);
        searchDir = path.resolve(currentDir, dirPath);
      } else {
        // Search in current directory
        searchDir = currentDir;
        searchPattern = partialPath;
      }

      // Find all .typ files in the search directory
      const files = await this.findTypstFiles(searchDir, searchPattern);

      for (const file of files) {
        if (token.isCancellationRequested) {
          break;
        }

        const relativePath = path.relative(currentDir, file);
        const pathWithoutExt = relativePath.replace(/\.typ$/, "");

        const completion = new vscode.CompletionItem(
          pathWithoutExt,
          vscode.CompletionItemKind.File
        );

        completion.detail = `Typst file: ${relativePath}`;
        completion.documentation = new vscode.MarkdownString(
          `Link to \`${pathWithoutExt}\``
        );
        completion.insertText = pathWithoutExt;
        completion.sortText = pathWithoutExt;

        completions.push(completion);
      }
    } catch (error) {
      console.error("Error providing file path completions:", error);
    }

    return completions;
  }

  /**
   * Provides completion items for labels within a file
   */
  private async provideLabelCompletions(
    document: vscode.TextDocument,
    partialPathWithLabel: string,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    const completions: vscode.CompletionItem[] = [];

    try {
      const colonIndex = partialPathWithLabel.indexOf(":");
      const filePath = partialPathWithLabel.substring(0, colonIndex);
      const partialLabel = partialPathWithLabel.substring(colonIndex + 1);

      // Resolve the target file
      const filePathWithExt = PathResolver.ensureTypstExtension(filePath);
      const targetUri = PathResolver.resolveFilePath(
        document.uri,
        filePathWithExt
      );

      // Check if target file exists
      const fileExists = await PathResolver.fileExists(targetUri);
      if (!fileExists) {
        return completions;
      }

      // Open the target document and find labels
      const targetDocument = await vscode.workspace.openTextDocument(targetUri);
      const labels = await this.extractLabelsFromDocument(targetDocument);

      for (const label of labels) {
        if (token.isCancellationRequested) {
          break;
        }

        // Filter labels based on partial input
        if (label.text.toLowerCase().includes(partialLabel.toLowerCase())) {
          const completion = new vscode.CompletionItem(
            label.text,
            vscode.CompletionItemKind.Reference
          );

          completion.detail = `${label.type} in ${path.basename(
            targetUri.fsPath
          )}`;
          completion.documentation = new vscode.MarkdownString(
            `Navigate to ${label.type}: \`${label.text}\``
          );
          completion.insertText = label.text;
          completion.sortText = label.text;

          completions.push(completion);
        }
      }
    } catch (error) {
      console.error("Error providing label completions:", error);
    }

    return completions;
  }

  /**
   * Finds all .typ files in a directory matching a pattern
   */
  private async findTypstFiles(
    searchDir: string,
    pattern: string
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const dirUri = vscode.Uri.file(searchDir);
      const entries = await vscode.workspace.fs.readDirectory(dirUri);

      for (const [name, type] of entries) {
        if (type === vscode.FileType.File && name.endsWith(".typ")) {
          const nameWithoutExt = name.replace(/\.typ$/, "");
          if (nameWithoutExt.toLowerCase().includes(pattern.toLowerCase())) {
            files.push(path.join(searchDir, name));
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search subdirectories
          const subDirFiles = await this.findTypstFiles(
            path.join(searchDir, name),
            pattern
          );
          files.push(...subDirFiles);
        }
      }
    } catch (error) {
      // Directory might not exist, ignore silently
    }

    return files;
  }

  /**
   * Extracts labels from a document
   */
  private async extractLabelsFromDocument(
    document: vscode.TextDocument
  ): Promise<Array<{ text: string; type: string }>> {
    const labels: Array<{ text: string; type: string }> = [];
    const text = document.getText();

    // Extract actual Typst labels in <label> syntax
    const labelRegex = /<([^<>\s]+)>/g;
    let match;
    while ((match = labelRegex.exec(text)) !== null) {
      labels.push({
        text: match[1],
        type: "label",
      });
    }

    // Extract headings (= Title, == Title, etc.)
    const lines = text.split("\n");
    for (const line of lines) {
      const headingMatch = line.match(/^\s*=+\s*(.+)$/);
      if (headingMatch) {
        labels.push({
          text: headingMatch[1].trim(),
          type: "heading",
        });
      }
    }

    return labels;
  }
}
