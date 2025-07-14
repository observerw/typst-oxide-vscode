import * as vscode from "vscode";
import * as path from "path";

export class LabelHoverProvider implements vscode.HoverProvider {
  /**
   * Provides hover information for Typst labels
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return undefined;
    }

    // Check if we're hovering over a label
    const labelInfo = this.getLabelAtPosition(document, position);
    if (!labelInfo) {
      return undefined;
    }

    const { label, range } = labelInfo;

    // Find all references to this label
    const references = await this.findLabelReferences(label, token);
    
    if (token.isCancellationRequested) {
      return undefined;
    }

    const referenceCount = references.length;
    const markdownString = new vscode.MarkdownString();
    
    if (referenceCount === 0) {
      markdownString.appendMarkdown(`**Label:** \`${label}\`\n\nNo references found`);
    } else if (referenceCount === 1) {
      markdownString.appendMarkdown(`**Label:** \`${label}\`\n\n1 reference found`);
    } else {
      markdownString.appendMarkdown(`**Label:** \`${label}\`\n\n${referenceCount} references found`);
    }

    // Add command link to show references
    if (referenceCount > 0) {
      markdownString.appendMarkdown(`\n\n[Show all references](command:editor.action.findReferences?${encodeURIComponent(
        JSON.stringify({
          uri: document.uri.toString(),
          position: { line: range.start.line, character: range.start.character }
        })
      )})`);
    }

    markdownString.isTrusted = true;
    return new vscode.Hover(markdownString, range);
  }

  /**
   * Gets label information at the given position
   */
  private getLabelAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { label: string; range: vscode.Range } | undefined {
    const lineText = document.lineAt(position.line).text;
    
    // Check for direct label syntax: <label>
    const directLabelRegex = /<([^<>\s]+)>/g;
    let match;
    
    while ((match = directLabelRegex.exec(lineText)) !== null) {
      const startPos = new vscode.Position(position.line, match.index);
      const endPos = new vscode.Position(position.line, match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      
      if (range.contains(position)) {
        return {
          label: match[1],
          range: new vscode.Range(
            new vscode.Position(position.line, match.index + 1),
            new vscode.Position(position.line, match.index + match[0].length - 1)
          )
        };
      }
    }

    // Check for wiki link label: [[file:label]]
    const wikiLinkRegex = /\[\[([^\]]+?):([^\]]+?)\]\]/g;
    wikiLinkRegex.lastIndex = 0;
    
    while ((match = wikiLinkRegex.exec(lineText)) !== null) {
      const labelPart = match[2];
      const labelStart = match.index + match[0].indexOf(labelPart);
      const startPos = new vscode.Position(position.line, labelStart);
      const endPos = new vscode.Position(position.line, labelStart + labelPart.length);
      const range = new vscode.Range(startPos, endPos);
      
      if (range.contains(position)) {
        return {
          label: labelPart,
          range
        };
      }
    }

    return undefined;
  }

  /**
   * Finds all references to a label in the workspace
   */
  private async findLabelReferences(
    label: string,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const references: vscode.Location[] = [];
    
    // Get all Typst files in workspace
    const typstFiles = await vscode.workspace.findFiles('**/*.typ');
    
    for (const fileUri of typstFiles) {
      if (token.isCancellationRequested) {
        break;
      }

      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const text = document.getText();
        
        // Find direct label references: <label>
        const directLabelRegex = new RegExp(`<${label}>`, 'g');
        let match;
        while ((match = directLabelRegex.exec(text)) !== null) {
          const position = document.positionAt(match.index + 1);
          references.push(new vscode.Location(fileUri, new vscode.Range(position, position)));
        }
        
        // Find wiki link label references: [[*:label]]
        const wikiLinkLabelRegex = new RegExp(`\\[\\[[^\]]*?:${label}\\]\\]`, 'g');
        while ((match = wikiLinkLabelRegex.exec(text)) !== null) {
          const labelStart = match[0].indexOf(label);
          const position = document.positionAt(match.index + labelStart);
          references.push(new vscode.Location(fileUri, new vscode.Range(position, position)));
        }
        
      } catch (error) {
        // Skip files that can't be opened
        console.warn(`Could not open file ${fileUri.fsPath}:`, error);
      }
    }

    return references;
  }
}