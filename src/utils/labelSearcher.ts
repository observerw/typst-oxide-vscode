import * as vscode from "vscode";

export interface LabelSearchResult {
  found: boolean;
  position?: vscode.Position;
  line?: string;
}

export class LabelSearcher {
  /**
   * Searches for a label in the target document
   */
  static async findLabel(
    document: vscode.TextDocument,
    label: string
  ): Promise<LabelSearchResult> {
    const text = document.getText();
    const lines = text.split("\n");

    // First, check for actual Typst labels in <label> syntax
    const labelRegex = /<([^\u003c\u003e\s]+)>/g;
    let match;
    while ((match = labelRegex.exec(text)) !== null) {
      if (match[1] === label) {
        const beforeMatch = text.substring(0, match.index);
        const lineIndex = beforeMatch.split("\n").length - 1;
        const lineStart = beforeMatch.lastIndexOf("\n") + 1;
        const charIndex = match.index - lineStart + 1; // +1 to position after <

        return {
          found: true,
          position: new vscode.Position(lineIndex, charIndex),
          line: lines[lineIndex] || "",
        };
      }
    }

    // Search strategies in order of priority
    const searchStrategies = [
      // 1. Exact match as heading (= Label, == Label, etc.)
      (line: string, lineIndex: number) =>
        this.findHeading(line, lineIndex, label),
      // 2. Exact match as comment (// Label)
      (line: string, lineIndex: number) =>
        this.findComment(line, lineIndex, label),
      // 3. Simple text match
      (line: string, lineIndex: number) =>
        this.findTextMatch(line, lineIndex, label),
    ];

    for (const strategy of searchStrategies) {
      for (let i = 0; i < lines.length; i++) {
        const result = strategy(lines[i], i);
        if (result.found) {
          return result;
        }
      }
    }

    return { found: false };
  }

  /**
   * Finds label as a Typst heading
   */
  private static findHeading(
    line: string,
    lineIndex: number,
    label: string
  ): LabelSearchResult {
    // Match Typst headings: = Title, == Title, === Title, etc.
    const headingRegex = /^(\s*=+\s*)(.+)$/;
    const match = line.match(headingRegex);

    if (match && match[2].trim().toLowerCase() === label.toLowerCase()) {
      return {
        found: true,
        position: new vscode.Position(lineIndex, match[1].length),
        line: line,
      };
    }

    return { found: false };
  }

  /**
   * Finds label as a comment
   */
  private static findComment(
    line: string,
    lineIndex: number,
    label: string
  ): LabelSearchResult {
    // Match single-line comments: // Label
    const commentRegex = /^(\s*\/\/\s*)(.+)$/;
    const match = line.match(commentRegex);

    if (match && match[2].trim().toLowerCase() === label.toLowerCase()) {
      return {
        found: true,
        position: new vscode.Position(lineIndex, match[1].length),
        line: line,
      };
    }

    // Match block comments: /* Label */
    const blockCommentRegex = /\/\*\s*([^*]+)\s*\*\//;
    const blockMatch = line.match(blockCommentRegex);

    if (
      blockMatch &&
      blockMatch[1].trim().toLowerCase() === label.toLowerCase()
    ) {
      const startIndex = line.indexOf("/*") + 2;
      return {
        found: true,
        position: new vscode.Position(lineIndex, startIndex),
        line: line,
      };
    }

    return { found: false };
  }

  /**
   * Finds label as simple text match
   */
  private static findTextMatch(
    line: string,
    lineIndex: number,
    label: string
  ): LabelSearchResult {
    const lowerLine = line.toLowerCase();
    const lowerLabel = label.toLowerCase();
    const index = lowerLine.indexOf(lowerLabel);

    if (index !== -1) {
      return {
        found: true,
        position: new vscode.Position(lineIndex, index),
        line: line,
      };
    }

    return { found: false };
  }

  /**
   * Navigates to a label position in the editor
   */
  static async navigateToLabel(
    document: vscode.TextDocument,
    label: string
  ): Promise<boolean> {
    const result = await this.findLabel(document, label);

    if (result.found && result.position) {
      const editor = await vscode.window.showTextDocument(document);
      editor.selection = new vscode.Selection(result.position, result.position);
      editor.revealRange(
        new vscode.Range(result.position, result.position),
        vscode.TextEditorRevealType.InCenter
      );
      return true;
    }

    return false;
  }
}
