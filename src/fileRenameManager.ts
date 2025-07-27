import * as vscode from "vscode";
import { LinkScanner } from "./utils/linkScanner";
import { LinkUpdater, RenameOperation } from "./utils/linkUpdater";

export class FileRenameManager {
  private isActive = false;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Activates the file rename manager
   */
  activate(): void {
    if (this.isActive) {
      return;
    }

    // Listen for workspace file system events
    const onWillRenameDisposable = vscode.workspace.onWillRenameFiles(
      this.handleWillRenameFiles.bind(this)
    );

    const onDidRenameDisposable = vscode.workspace.onDidRenameFiles(
      this.handleDidRenameFiles.bind(this)
    );

    this.context.subscriptions.push(
      onWillRenameDisposable,
      onDidRenameDisposable
    );

    this.isActive = true;
  }

  /**
   * Handles file rename events before they occur (for validation)
   */
  private async handleWillRenameFiles(
    event: vscode.FileWillRenameEvent
  ): Promise<void> {
    // We can use this for pre-validation if needed
    // For now, we'll handle the actual updates in onDidRenameFiles
  }

  /**
   * Handles file rename events after they occur
   */
  private async handleDidRenameFiles(
    event: vscode.FileRenameEvent
  ): Promise<void> {
    try {
      // Filter for .typ files only
      const typRenames = event.files.filter(
        (file) =>
          file.oldUri.fsPath.endsWith(".typ") ||
          file.newUri.fsPath.endsWith(".typ")
      );

      if (typRenames.length === 0) {
        return;
      }

      // Create rename operations
      const renameOperations: RenameOperation[] = typRenames.map((file) =>
        LinkUpdater.createRenameOperation(file.oldUri, file.newUri)
      );

      // Process renames with progress
      if (renameOperations.length === 1) {
        await this.processSingleRename(renameOperations[0]);
      } else {
        await this.processBatchRename(renameOperations);
      }
    } catch (error) {
      console.error("Error handling file rename:", error);
      vscode.window.showErrorMessage(
        `Failed to update wiki links after file rename: ${error}`
      );
    }
  }

  /**
   * Processes a single file rename
   */
  private async processSingleRename(
    renameOperation: RenameOperation
  ): Promise<void> {
    try {
      // Find files that link to the renamed file
      const linkingFiles = await LinkScanner.findFilesLinkingTo(
        renameOperation.oldUri
      );

      if (linkingFiles.length === 0) {
        return; // No files to update
      }

      // Ask for confirmation
      const shouldUpdate = await LinkUpdater.confirmUpdate(
        renameOperation,
        linkingFiles.length
      );
      if (!shouldUpdate) {
        return;
      }

      // Show progress and update links
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Updating wiki links...",
          cancellable: false,
        },
        async (progress) => {
          const results = await LinkUpdater.updateLinksForRename(
            renameOperation,
            progress
          );
          await LinkUpdater.showUpdateSummary(results);
        }
      );
    } catch (error) {
      console.error("Error processing single rename:", error);
      throw error;
    }
  }

  /**
   * Processes multiple file renames (batch operation)
   */
  private async processBatchRename(
    renameOperations: RenameOperation[]
  ): Promise<void> {
    try {
      // Collect all affected files
      const allLinkingFiles = new Map<string, any>();
      let totalAffectedFiles = 0;

      for (const operation of renameOperations) {
        const linkingFiles = await LinkScanner.findFilesLinkingTo(
          operation.oldUri
        );
        allLinkingFiles.set(operation.oldUri.fsPath, linkingFiles);
        totalAffectedFiles += linkingFiles.length;
      }

      if (totalAffectedFiles === 0) {
        return; // No files to update
      }

      // Ask for confirmation
      const shouldUpdate = await this.confirmBatchRename(
        renameOperations.length,
        totalAffectedFiles
      );
      if (!shouldUpdate) {
        return;
      }

      // Show progress and update all links
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Updating wiki links for batch rename...",
          cancellable: false,
        },
        async (progress) => {
          const allResults: Awaited<
            ReturnType<typeof LinkUpdater.handleBatchRename>
          > = [];

          for (const operation of renameOperations) {
            const results = await LinkUpdater.updateLinksForRename(
              operation,
              progress
            );
            allResults.push(...results);
          }

          await LinkUpdater.showUpdateSummary(allResults);
        }
      );
    } catch (error) {
      console.error("Error processing batch rename:", error);
      throw error;
    }
  }

  /**
   * Shows confirmation dialog for batch renames
   */
  private async confirmBatchRename(
    fileCount: number,
    totalAffectedFiles: number
  ): Promise<boolean> {
    const message = `Update wiki links for ${fileCount} renamed file${
      fileCount === 1 ? "" : "s"
    } affecting ${totalAffectedFiles} file${
      totalAffectedFiles === 1 ? "" : "s"
    }?`;

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      "Update All Links",
      "Skip"
    );

    return result === "Update All Links";
  }

  /**
   * Manually triggers a link update for testing purposes
   */
  async triggerManualUpdate(
    oldUri: vscode.Uri,
    newUri: vscode.Uri
  ): Promise<void> {
    if (!oldUri.fsPath.endsWith(".typ") || !newUri.fsPath.endsWith(".typ")) {
      vscode.window.showWarningMessage(
        "Manual update only works for .typ files"
      );
      return;
    }

    const renameOperation = LinkUpdater.createRenameOperation(oldUri, newUri);
    await this.processSingleRename(renameOperation);
  }

  /**
   * Deactivates the file rename manager
   */
  deactivate(): void {
    this.isActive = false;
  }

  dispose(): void {
    this.deactivate();
  }

  /**
   * Checks if the manager is active
   */
  isManagerActive(): boolean {
    return this.isActive;
  }

  /**
   * Gets statistics about files that would be affected by a rename
   */
  async getRenamePreview(oldUri: vscode.Uri): Promise<{
    linkingFiles: number;
    totalLinks: number;
    files: Array<{ uri: vscode.Uri; linkCount: number }>;
  }> {
    const linkingFiles = await LinkScanner.findFilesLinkingTo(oldUri);

    return {
      linkingFiles: linkingFiles.length,
      totalLinks: linkingFiles.reduce(
        (sum, file) => sum + file.links.length,
        0
      ),
      files: linkingFiles.map((file) => ({
        uri: file.uri,
        linkCount: file.links.length,
      })),
    };
  }
}
