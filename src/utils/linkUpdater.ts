import * as vscode from "vscode";
import * as path from "path";
import { LinkScanner, WikiLinkMatch, FileWithLinks } from "./linkScanner";

export interface LinkUpdateResult {
  fileUri: vscode.Uri;
  updated: boolean;
  changes: number;
  originalText: string;
  updatedText: string;
}

export interface RenameOperation {
  oldUri: vscode.Uri;
  newUri: vscode.Uri;
  oldPath: string;
  newPath: string;
}

export class LinkUpdater {
  /**
   * Updates wiki links in files when a target file is renamed
   */
  static async updateLinksForRename(
    renameOperation: RenameOperation,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<LinkUpdateResult[]> {
    const results: LinkUpdateResult[] = [];
    
    // Find all files that link to the renamed file
    const linkingFiles = await LinkScanner.findFilesLinkingTo(renameOperation.oldUri);
    
    if (linkingFiles.length === 0) {
      return results;
    }

    const totalFiles = linkingFiles.length;
    let processedFiles = 0;

    for (const fileWithLinks of linkingFiles) {
      if (progress) {
        progress.report({
          message: `Updating links in ${path.basename(fileWithLinks.uri.fsPath)}...`,
          increment: (1 / totalFiles) * 100
        });
      }

      const result = await this.updateFileLinks(fileWithLinks, renameOperation);
      if (result.updated) {
        results.push(result);
      }

      processedFiles++;
    }

    return results;
  }

  /**
   * Updates wiki links in a single file
   */
  private static async updateFileLinks(
    fileWithLinks: FileWithLinks,
    renameOperation: RenameOperation
  ): Promise<LinkUpdateResult> {
    const document = await vscode.workspace.openTextDocument(fileWithLinks.uri);
    const originalText = document.getText();
    let updatedText = originalText;
    let changes = 0;

    // Sort links by position (reverse order to maintain positions while replacing)
    const sortedLinks = [...fileWithLinks.links].sort((a, b) => b.range.start.compareTo(a.range.start));

    // Build the new path based on the rename operation
    const newPath = this.calculateNewLinkPath(fileWithLinks.uri, renameOperation);

    for (const link of sortedLinks) {
      if (this.shouldUpdateLink(link.filePath, renameOperation.oldPath)) {
        const oldLinkText = LinkUpdater.buildLinkText(link);
        const newLinkText = LinkUpdater.buildLinkText({
          ...link,
          filePath: newPath
        });

        // Replace the link in the text
        const startOffset = document.offsetAt(link.range.start);
        const endOffset = document.offsetAt(link.range.end);
        
        updatedText = updatedText.slice(0, startOffset) + newLinkText + updatedText.slice(endOffset);
        changes++;
      }
    }

    const updated = originalText !== updatedText;

    if (updated) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
      );
      edit.replace(fileWithLinks.uri, fullRange, updatedText);
      await vscode.workspace.applyEdit(edit);
      
      // Save the document if it's not dirty
      const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === fileWithLinks.uri.toString());
      if (editor && !editor.document.isDirty) {
        await editor.document.save();
      }
    }

    return {
      fileUri: fileWithLinks.uri,
      updated,
      changes,
      originalText,
      updatedText
    };
  }

  /**
   * Determines if a link should be updated based on the rename operation
   */
  private static shouldUpdateLink(linkPath: string, oldTargetPath: string): boolean {
    // Normalize paths for comparison
    const normalizedLinkPath = this.normalizePath(linkPath);
    const normalizedOldPath = this.normalizePath(oldTargetPath);
    
    return normalizedLinkPath === normalizedOldPath || 
           normalizedLinkPath === normalizedOldPath + ".typ" ||
           normalizedLinkPath === normalizedOldPath.replace(/\.typ$/, "");
  }

  /**
   * Calculates the new path for a wiki link after rename
   */
  private static calculateNewLinkPath(
    sourceUri: vscode.Uri,
    renameOperation: RenameOperation
  ): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (!workspaceFolder) {
      return renameOperation.newPath;
    }

    // Calculate relative path from source file to new target
    const newRelativePath = path.relative(
      path.dirname(sourceUri.fsPath),
      renameOperation.newUri.fsPath
    );

    // Remove .typ extension for wiki links
    const newPathWithoutExt = newRelativePath.replace(/\.typ$/, "");

    // Normalize path separators
    return newPathWithoutExt.replace(/\\/g, "/");
  }

  /**
   * Builds the full wiki link text from components
   */
  private static buildLinkText(link: {
    filePath: string;
    label?: string;
    alias?: string;
  }): string {
    let linkText = `[[${link.filePath}`;
    
    if (link.label) {
      linkText += `:${link.label}`;
    }
    
    if (link.alias) {
      linkText += `|${link.alias}`;
    }
    
    linkText += "]]";
    
    return linkText;
  }

  /**
   * Normalizes a path for comparison
   */
  private static normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\//, "");
  }

  /**
   * Creates a rename operation from VS Code file events
   */
  static createRenameOperation(oldUri: vscode.Uri, newUri: vscode.Uri): RenameOperation {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(oldUri);
    const oldPath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, oldUri.fsPath).replace(/\.typ$/, "")
      : oldUri.fsPath.replace(/\.typ$/, "");

    const newPath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, newUri.fsPath).replace(/\.typ$/, "")
      : newUri.fsPath.replace(/\.typ$/, "");

    return {
      oldUri,
      newUri,
      oldPath: oldPath.replace(/\\/g, "/"),
      newPath: newPath.replace(/\\/g, "/")
    };
  }

  /**
   * Handles batch file renames (e.g., when a directory is renamed)
   */
  static async handleBatchRename(
    renameOperations: RenameOperation[],
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<LinkUpdateResult[]> {
    const allResults: LinkUpdateResult[] = [];
    
    const totalOperations = renameOperations.length;
    let processedOperations = 0;

    for (const operation of renameOperations) {
      if (progress) {
        progress.report({
          message: `Processing ${path.basename(operation.oldUri.fsPath)} → ${path.basename(operation.newUri.fsPath)}`,
          increment: (1 / totalOperations) * 100
        });
      }

      const results = await this.updateLinksForRename(operation);
      allResults.push(...results);

      processedOperations++;
    }

    return allResults;
  }

  /**
   * Shows a confirmation dialog before applying changes
   */
  static async confirmUpdate(
    renameOperation: RenameOperation,
    affectedFiles: number
  ): Promise<boolean> {
    const message = `Update ${affectedFiles} wiki link${affectedFiles === 1 ? '' : 's'} to reflect the rename of "${path.basename(renameOperation.oldUri.fsPath)}"?`;
    
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      "Update Links",
      "Skip"
    );

    return result === "Update Links";
  }

  /**
   * Shows a summary of the update operation
   */
  static async showUpdateSummary(results: LinkUpdateResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    const totalChanges = results.reduce((sum, result) => sum + result.changes, 0);
    const fileCount = results.length;

    const message = `Updated ${totalChanges} wiki link${totalChanges === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}`;
    
    vscode.window.showInformationMessage(message);
  }
}