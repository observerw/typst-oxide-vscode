import * as vscode from "vscode";
import { DatabaseService } from "../indexing/dbService";
import { MetadataExtractor } from "../indexing/metadataExtractor";
import { PathResolver } from "../utils/pathResolver";

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
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private dbService: DatabaseService;
  private metadataExtractor: MetadataExtractor;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
    this.metadataExtractor = MetadataExtractor.getInstance();
    this.setupFileWatcher();
  }

  public static getInstance(): LinkDiscovery {
    if (!LinkDiscovery.instance) {
      LinkDiscovery.instance = new LinkDiscovery();
    }
    return LinkDiscovery.instance;
  }

  /**
   * Sets up file watchers to update database when files change
   */
  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.typ");

    this.fileWatcher.onDidChange(async (uri) => {
      await this.updateFileInDatabase(uri);
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      await this.updateFileInDatabase(uri);
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      await this.dbService.deleteFile(uri.fsPath);
      this.invalidateFile(uri.fsPath);
    });
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
   * Updates a file in the database with fresh metadata
   */
  private async updateFileInDatabase(uri: vscode.Uri): Promise<void> {
    try {
      const metadata = await this.metadataExtractor.extractMetadata(uri);
      if (metadata) {
        await this.dbService.upsertFile({
          filePath: metadata.filePath,
          lastModified: metadata.lastModified,
          metadata: metadata.metadata,
          aliases: Array.isArray(metadata.metadata?.alias) ? metadata.metadata.alias : [],
          wikilinks: metadata.wikilinks.map((link) => ({
            sourceFile: metadata.filePath,
            targetFile: link.targetFile,
            label: link.label,
            alias: link.alias,
            range: link.range,
          })),
          labels: metadata.labels.map((label) => ({
            name: label.name,
            filePath: metadata.filePath,
            position: label.position,
            type: label.type,
          })),
          headings: metadata.headings.map((heading) => ({
            text: heading.text,
            level: heading.level,
            filePath: metadata.filePath,
            position: heading.position,
          })),
        });
      }
    } catch (error) {
      console.error(`Failed to update file in database: ${uri.fsPath}`, error);
    }
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
    try {
      const filePath = fileUri.fsPath;
      const isIndexed = await this.dbService.isFileIndexed(filePath);

      if (!isIndexed) {
        await this.updateFileInDatabase(fileUri);
      } else {
        // Check if file has been modified since last indexing
        const stats = await vscode.workspace.fs.stat(fileUri);
        const lastIndexed = await this.dbService.getLastModified(filePath);

        if (!lastIndexed || stats.mtime > lastIndexed) {
          await this.updateFileInDatabase(fileUri);
        }
      }
    } catch (error) {
      console.error(
        `Failed to ensure file is indexed: ${fileUri.fsPath}`,
        error
      );
    }
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
    await this.updateFileInDatabase(fileUri);
  }

  /**
   * Refreshes the entire cache and re-indexes all files
   */
  public async refreshAll(): Promise<void> {
    this.invalidateCache();
    await this.indexWorkspace();
  }

  /**
   * Indexes all .typ files in the workspace
   */
  public async indexWorkspace(): Promise<void> {
    try {
      const allTypstFiles = await vscode.workspace.findFiles(
        "**/*.typ",
        "**/node_modules/**"
      );

      for (const fileUri of allTypstFiles) {
        await this.updateFileInDatabase(fileUri);
      }
    } catch (error) {
      console.error("Failed to index workspace:", error);
    }
  }

  /**
   * Initializes the indexing system
   */
  public async initialize(): Promise<void> {
    await this.dbService.initialize();
    await this.indexWorkspace();
  }

  /**
   * Disposes resources
   */
  public async dispose(): Promise<void> {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.invalidateCache();
    await this.dbService.dispose();
  }
}
