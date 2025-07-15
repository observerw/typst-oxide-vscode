import * as vscode from "vscode";
import { LabelSymbolProvider } from "./labelSymbolProvider";
import { LabelUpdater } from "./utils/labelUpdater";

export class LabelRenameProvider implements vscode.RenameProvider {
  /**
   * Provides rename edits for labels and headings
   */
  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken
  ): Promise<vscode.WorkspaceEdit | null> {
    // Find the label at the given position
    const label = this.findLabelAtPosition(document, position);
    if (!label) {
      return null;
    }

    // Validate new label name
    const validationResult = this.validateLabelName(newName);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    // Check for conflicts within the same document
    const conflict = await this.checkForConflicts(document, label.name, newName);
    if (conflict) {
      throw new Error(`Label "${newName}" already exists in this document`);
    }

    // Create workspace edit
    const workspaceEdit = new vscode.WorkspaceEdit();

    // Add the edit to rename the label in the current document
    const renameEdit = this.createLabelRenameEdit(document, label, newName);
    if (renameEdit) {
      workspaceEdit.replace(document.uri, renameEdit.range, renameEdit.newText);
    }

    // Find and update all wiki links that reference this label
    const labelUpdater = new LabelUpdater();
    const linkEdits = await labelUpdater.findWikiLinksToUpdate(document, label.name, newName);
    
    for (const edit of linkEdits) {
      workspaceEdit.replace(edit.uri, edit.range, edit.newText);
    }

    return workspaceEdit;
  }

  /**
   * Provides rename validation and preview
   */
  async prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Range | { range: vscode.Range; placeholder: string } | null> {
    const label = this.findLabelAtPosition(document, position);
    if (!label) {
      return null;
    }

    return {
      range: label.range,
      placeholder: label.name
    };
  }

  /**
   * Finds a label at the given position
   */
  private findLabelAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { name: string; range: vscode.Range; kind: 'label' | 'heading' } | null {
    const labels = LabelSymbolProvider.extractAllLabels(document);
    
    // Find the label that contains the position
    for (const label of labels) {
      if (label.range.contains(position)) {
        return label;
      }
    }

    return null;
  }

  /**
   * Validates a new label name
   */
  private validateLabelName(name: string): { valid: boolean; error?: string } {
    // Check for empty name
    if (!name || name.trim().length === 0) {
      return { valid: false, error: "Label name cannot be empty" };
    }

    // Check for valid characters (alphanumeric, underscore, hyphen, colon)
    const validCharsRegex = /^[a-zA-Z0-9_\-:]+$/;
    if (!validCharsRegex.test(name)) {
      return { 
        valid: false, 
        error: "Label name can only contain letters, numbers, underscores, hyphens, and colons" 
      };
    }

    // Check for reserved keywords or patterns
    const reserved = ['true', 'false', 'none', 'auto', 'auto'];
    if (reserved.includes(name.toLowerCase())) {
      return { valid: false, error: `"${name}" is a reserved keyword` };
    }

    return { valid: true };
  }

  /**
   * Checks for naming conflicts within the document
   */
  private async checkForConflicts(
    document: vscode.TextDocument,
    oldName: string,
    newName: string
  ): Promise<boolean> {
    const labels = LabelSymbolProvider.extractAllLabels(document);
    return labels.some(label => label.name === newName && label.name !== oldName);
  }

  /**
   * Creates the edit to rename the label in the document
   */
  private createLabelRenameEdit(
    document: vscode.TextDocument,
    label: { name: string; range: vscode.Range; kind: 'label' | 'heading' },
    newName: string
  ): { range: vscode.Range; newText: string } | null {
    if (label.kind === 'label') {
      // For <label> syntax, we need to replace just the label content
      return {
        range: label.range,
        newText: newName
      };
    } else if (label.kind === 'heading') {
      // For headings, we need to be more careful about the text
      const line = document.lineAt(label.range.start.line);
      const headingMatch = line.text.match(/^(=+\s*)(.+)$/);
      
      if (headingMatch) {
        const headingPrefix = headingMatch[1];
        const headingText = headingMatch[2];
        const headingStart = line.text.indexOf(headingText);
        
        if (headingStart !== -1) {
          const headingRange = new vscode.Range(
            new vscode.Position(label.range.start.line, headingStart),
            new vscode.Position(label.range.start.line, headingStart + headingText.length)
          );
          
          return {
            range: headingRange,
            newText: newName
          };
        }
      }
    }

    return null;
  }
}