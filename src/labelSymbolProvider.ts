import * as vscode from "vscode";

export interface LabelSymbol {
  name: string;
  kind: vscode.SymbolKind;
  range: vscode.Range;
  selectionRange: vscode.Range;
  detail?: string;
}

export class LabelSymbolProvider implements vscode.DocumentSymbolProvider {
  /**
   * Provides document symbols for labels and headings in Typst files
   */
  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const symbols: vscode.DocumentSymbol[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Find all labels in <label> syntax
    const labelRegex = /<([^<>\s]+)>/g;
    let match;
    
    labelRegex.lastIndex = 0;
    while ((match = labelRegex.exec(text)) !== null) {
      if (token.isCancellationRequested) {
        break;
      }

      const labelName = match[1];
      const startPos = document.positionAt(match.index + 1); // Position after '<'
      const endPos = document.positionAt(match.index + 1 + labelName.length);
      
      const range = new vscode.Range(startPos, endPos);
      const symbol = new vscode.DocumentSymbol(
        labelName,
        `Label: ${labelName}`,
        vscode.SymbolKind.EnumMember,
        range,
        range
      );
      symbol.detail = "Label";
      symbols.push(symbol);
    }

    // Find all headings
    for (let i = 0; i < lines.length; i++) {
      if (token.isCancellationRequested) {
        break;
      }

      const line = lines[i];
      const headingMatch = line.match(/^(=+)(\s+)(.+)$/);
      
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[3].trim();
        const headingStart = line.indexOf(headingText);
        
        const startPos = new vscode.Position(i, headingStart);
        const endPos = new vscode.Position(i, headingStart + headingText.length);
        const range = new vscode.Range(startPos, endPos);
        
        const symbolKind = this.getHeadingSymbolKind(level);
        const symbol = new vscode.DocumentSymbol(
          headingText,
          `Heading (${level})`,
          symbolKind,
          range,
          range
        );
        symbol.detail = `Level ${level} heading`;
        symbols.push(symbol);
      }
    }

    return symbols;
  }

  /**
   * Maps heading level to appropriate symbol kind for better UX
   */
  private getHeadingSymbolKind(level: number): vscode.SymbolKind {
    switch (level) {
      case 1: return vscode.SymbolKind.Class;
      case 2: return vscode.SymbolKind.Method;
      case 3: return vscode.SymbolKind.Property;
      case 4: return vscode.SymbolKind.EnumMember;
      case 5: return vscode.SymbolKind.Variable;
      default: return vscode.SymbolKind.Constant;
    }
  }

  /**
   * Extracts all labels from a document for internal use
   */
  static extractAllLabels(document: vscode.TextDocument): Array<{
    name: string;
    range: vscode.Range;
    kind: 'label' | 'heading';
  }> {
    const labels: Array<{
      name: string;
      range: vscode.Range;
      kind: 'label' | 'heading';
    }> = [];
    
    const text = document.getText();
    const lines = text.split('\n');

    // Find labels in <label> syntax
    const labelRegex = /<([^<>\s]+)>/g;
    let match;
    
    labelRegex.lastIndex = 0;
    while ((match = labelRegex.exec(text)) !== null) {
      const labelName = match[1];
      const startPos = document.positionAt(match.index + 1);
      const endPos = document.positionAt(match.index + 1 + labelName.length);
      
      labels.push({
        name: labelName,
        range: new vscode.Range(startPos, endPos),
        kind: 'label'
      });
    }

    // Find headings
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(=+)(\s+)(.+)$/);
      
      if (headingMatch) {
        const headingText = headingMatch[3].trim();
        const headingStart = line.indexOf(headingText);
        
        const startPos = new vscode.Position(i, headingStart);
        const endPos = new vscode.Position(i, headingStart + headingText.length);
        
        labels.push({
          name: headingText,
          range: new vscode.Range(startPos, endPos),
          kind: 'heading'
        });
      }
    }

    return labels;
  }

  /**
   * Finds a specific label by name within a document
   */
  static findLabelByName(
    document: vscode.TextDocument,
    labelName: string
  ): {
    name: string;
    range: vscode.Range;
    kind: 'label' | 'heading';
  } | null {
    const labels = this.extractAllLabels(document);
    return labels.find(label => label.name === labelName) || null;
  }
}