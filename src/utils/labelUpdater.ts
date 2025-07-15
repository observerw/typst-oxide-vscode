import * as vscode from "vscode";
import * as path from "path";
import { LinkScanner } from "./linkScanner";
import { PathResolver } from "./pathResolver";
import { LabelSymbolProvider } from "../labelSymbolProvider";

export interface LabelUpdateEdit {
  uri: vscode.Uri;
  range: vscode.Range;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

export interface LabelUpdateResult {
  edits: LabelUpdateEdit[];
  affectedFiles: number;
  totalLinks: number;
}

export class LabelUpdater {
  /**
   * Finds all wiki links that reference a specific label and creates update edits
   */
  async findWikiLinksToUpdate(
    sourceDocument: vscode.TextDocument,
    oldLabel: string,
    newLabel: string
  ): Promise<LabelUpdateEdit[]> {
    const edits: LabelUpdateEdit[] = [];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      return edits;
    }

    // Find all .typ files in the workspace
    const files = await vscode.workspace.findFiles("**/*.typ", "**/node_modules/**");
    
    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const fileEdits = await this.updateLinksInDocument(document, sourceDocument.uri, oldLabel, newLabel);
        edits.push(...fileEdits);
      } catch (error) {
        console.warn(`Failed to process ${fileUri.fsPath}:`, error);
      }
    }

    return edits;
  }

  /**
   * Updates wiki links in a specific document
   */
  private async updateLinksInDocument(
    document: vscode.TextDocument,
    sourceUri: vscode.Uri,
    oldLabel: string,
    newLabel: string
  ): Promise<LabelUpdateEdit[]> {
    const edits: LabelUpdateEdit[] = [];
    const links = await LinkScanner.scanDocument(document);

    for (const link of links) {
      if (!link.label) {
        continue; // Skip links without labels
      }

      // Check if this link points to the source document
      const targetUri = this.resolveLinkTarget(document.uri, link.filePath);
      if (targetUri.fsPath !== sourceUri.fsPath) {
        continue; // Skip links to other documents
      }

      // Check if the label matches the old label
      if (link.label.trim() === oldLabel) {
        // Create the edit
        const newLinkText = this.createUpdatedLinkText(link, newLabel);
        const range = link.range;
        
        edits.push({
          uri: document.uri,
          range,
          newText: newLinkText,
          oldLabel,
          newLabel
        });
      }
    }

    return edits;
  }

  /**
   * Resolves the target URI for a wiki link
   */
  private resolveLinkTarget(sourceUri: vscode.Uri, linkPath: string): vscode.Uri {
    const filePathWithExt = PathResolver.ensureTypstExtension(linkPath);
    return PathResolver.resolveFilePath(sourceUri, filePathWithExt);
  }

  /**
   * Creates updated link text with the new label
   */
  private createUpdatedLinkText(link: any, newLabel: string): string {
    const { filePath, alias } = link;
    
    let newText = `[[${filePath}:${newLabel}`;
    
    if (alias) {
      newText += `|${alias}`;
    }
    
    newText += "]]";
    
    return newText;
  }

  /**
   * Applies label updates with progress reporting
   */
  async applyLabelUpdates(
    edits: LabelUpdateEdit[],
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<LabelUpdateResult> {
    if (edits.length === 0) {
      return { edits: [], affectedFiles: 0, totalLinks: 0 };
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    const affectedFiles = new Set<string>();

    for (const edit of edits) {
      workspaceEdit.replace(edit.uri, edit.range, edit.newText);
      affectedFiles.add(edit.uri.fsPath);
    }

    // Show progress if provided
    if (progress) {
      progress.report({ message: `Preparing to update ${edits.length} wiki links...` });
    }

    // Apply the workspace edit
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    
    if (!success) {
      throw new Error("Failed to apply label updates");
    }

    return {
      edits,
      affectedFiles: affectedFiles.size,
      totalLinks: edits.length
    };
  }

  /**
   * Shows a preview of changes before applying them
   */
  async showLabelUpdatePreview(
    sourceDocument: vscode.TextDocument,
    oldLabel: string,
    newLabel: string
  ): Promise<{
    shouldProceed: boolean;
    edits: LabelUpdateEdit[];
  }> {
    const edits = await this.findWikiLinksToUpdate(sourceDocument, oldLabel, newLabel);
    
    if (edits.length === 0) {
      await vscode.window.showInformationMessage(
        `No wiki links found referencing label "${oldLabel}"`
      );
      return { shouldProceed: false, edits: [] };
    }

    const affectedFiles = new Set<string>();
    edits.forEach(edit => affectedFiles.add(edit.uri.fsPath));

    const message = `Rename label "${oldLabel}" to "${newLabel}"?\n\n` +
      `This will update ${edits.length} wiki link${edits.length === 1 ? '' : 's'} ` +
      `in ${affectedFiles.size} file${affectedFiles.size === 1 ? '' : 's'}.`;

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      "Rename",
      "Cancel"
    );

    return {
      shouldProceed: result === "Rename",
      edits
    };
  }

  /**
   * Checks if a label exists in a document
   */
  static async labelExists(
    document: vscode.TextDocument,
    labelName: string
  ): Promise<boolean> {
    const labels = LabelSymbolProvider.extractAllLabels(document);
    return labels.some((label: { name: string }) => label.name === labelName);
  }

  /**
   * Gets all labels used in wiki links across the workspace
   */
  async getAllReferencedLabels(): Promise<Set<string>> {
    const referencedLabels = new Set<string>();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      return referencedLabels;
    }

    const files = await vscode.workspace.findFiles("**/*.typ", "**/node_modules/**");
    
    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const links = await LinkScanner.scanDocument(document);
        
        links.forEach(link => {
          if (link.label) {
            referencedLabels.add(link.label.trim());
          }
        });
      } catch (error) {
        console.warn(`Failed to scan ${fileUri.fsPath}:`, error);
      }
    }

    return referencedLabels;
  }

  /**
   * Shows a summary of label update results
   */
  async showUpdateSummary(result: LabelUpdateResult): Promise<void> {
    if (result.totalLinks === 0) {
      return;
    }

    const message = `Successfully updated ${result.totalLinks} wiki link${result.totalLinks === 1 ? '' : 's'} ` +
      `in ${result.affectedFiles} file${result.affectedFiles === 1 ? '' : 's'}.`;

    await vscode.window.showInformationMessage(message, "OK");
  }
}