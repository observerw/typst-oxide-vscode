import * as vscode from "vscode";
import { DatabaseService } from "../indexing/dbService";
import { PathResolver } from "../utils/pathResolver";
import { IndexingService } from "./indexingService";

export interface LinkInfo {
  sourceFile: string;
  targetFile: string;
  label?: string;
  range: vscode.Range;
  exists: boolean;
  labelExists?: boolean;
}

export interface FileLinks {
  filePath: string;
  forwardLinks: LinkInfo[];
  backwardLinks: LinkInfo[];
}

export class LinkDiscovery {
  private static instance: LinkDiscovery;
  private linkCache: Map<string, FileLinks> = new Map();
  private indexingService: IndexingService;
  private dbService: DatabaseService;

  private constructor() {
    this.indexingService = IndexingService.getInstance();
    this.dbService = this.indexingService.getDatabaseService();
  }

  public static getInstance(): LinkDiscovery {
    if (!LinkDiscovery.instance) {
      LinkDiscovery.instance = new LinkDiscovery();
    }
    return LinkDiscovery.instance;
  }


  /**
   * Invalidates the entire cache
   */
  private invalidateCache(): void {
    this.linkCache.clear();
  }

  /**
   * Invalidates cache for a specific file
   */
  private invalidateFile(filePath: string): void {
    this.linkCache.delete(filePath);
  }

  /**
   * Gets all links for a specific file
   */
  public async getFileLinks(fileUri: vscode.Uri): Promise<FileLinks> {
    const filePath = fileUri.fsPath;

    if (this.linkCache.has(filePath)) {
      return this.linkCache.get(filePath)!;
    }

    // Ensure file is indexed
    await this.ensureFileIndexed(fileUri);

    const forwardLinks = await this.getForwardLinks(fileUri);
    const backwardLinks = await this.getBackwardLinks(fileUri);

    const fileLinks: FileLinks = {
      filePath,
      forwardLinks,
      backwardLinks,
    };

    this.linkCache.set(filePath, fileLinks);
    return fileLinks;
  }

  /**
   * Ensures a file is indexed in the database
   */
  private async ensureFileIndexed(fileUri: vscode.Uri): Promise<void> {
    await this.indexingService.ensureFileIndexed(fileUri);
  }

  /**
   * Gets all forward links from a file (links pointing out)
   */
  private async getForwardLinks(fileUri: vscode.Uri): Promise<LinkInfo[]> {
    try {
      const fileData = await this.dbService.getFile(fileUri.fsPath);
      if (!fileData) {
        return [];
      }

      const forwardLinks: LinkInfo[] = [];

      for (const link of fileData.wikilinks) {
        const targetFilePath = PathResolver.ensureTypstExtension(
          link.targetFile
        );
        const targetUri = PathResolver.resolveFilePath(fileUri, targetFilePath);

        const targetExists = await PathResolver.fileExists(targetUri);
        let labelExists: boolean | undefined;

        if (targetExists && link.label) {
          const targetLabels = await this.dbService.getLabelsInFile(
            targetUri.fsPath
          );
          labelExists = targetLabels.some((label) => label.name === link.label);
        }

        forwardLinks.push({
          sourceFile: fileUri.fsPath,
          targetFile: targetUri.fsPath,
          label: link.label,
          range: new vscode.Range(
            link.range.start.line,
            link.range.start.character,
            link.range.end.line,
            link.range.end.character
          ),
          exists: targetExists,
          labelExists,
        });
      }

      return forwardLinks;
    } catch {
      return [];
    }
  }

  /**
   * Gets all backward links to a file (links pointing in)
   */
  private async getBackwardLinks(fileUri: vscode.Uri): Promise<LinkInfo[]> {
    try {
      const linkingFiles = await this.dbService.getFilesWithWikilinksTo(
        fileUri.fsPath
      );
      const backwardLinks: LinkInfo[] = [];

      for (const linkingFile of linkingFiles) {
        const sourceUri = vscode.Uri.file(linkingFile.filePath);

        for (const link of linkingFile.wikilinks) {
          if (link.targetFile === fileUri.fsPath) {
            let labelExists: boolean | undefined;

            if (link.label) {
              const targetLabels = await this.dbService.getLabelsInFile(
                fileUri.fsPath
              );
              labelExists = targetLabels.some(
                (label) => label.name === link.label
              );
            }

            backwardLinks.push({
              sourceFile: linkingFile.filePath,
              targetFile: fileUri.fsPath,
              label: link.label,
              range: new vscode.Range(
                link.range.start.line,
                link.range.start.character,
                link.range.end.line,
                link.range.end.character
              ),
              exists: true,
              labelExists,
            });
          }
        }
      }

      return backwardLinks;
    } catch {
      return [];
    }
  }

  /**
   * Refreshes the cache for a specific file
   */
  public async refreshFile(fileUri: vscode.Uri): Promise<void> {
    this.invalidateFile(fileUri.fsPath);
    await this.indexingService.refreshFile(fileUri);
  }

  /**
   * Refreshes the entire cache and re-indexes all files
   */
  public async refreshAll(): Promise<void> {
    this.invalidateCache();
    await this.indexingService.refreshAll();
  }

  /**
   * Disposes resources
   */
  public dispose(): void {
    this.invalidateCache();
  }
}
