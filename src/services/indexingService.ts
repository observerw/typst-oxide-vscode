import * as vscode from "vscode";
import { DatabaseService } from "../indexing/dbService";
import { MetadataExtractor } from "../indexing/metadataExtractor";
import { FileWatcherService } from "./fileWatcherService";

const INDEXING_SERVICE_ID = "indexing-service";

export class IndexingService {
  private static instance: IndexingService;
  private fileWatcherService: FileWatcherService;
  private dbService: DatabaseService;
  private metadataExtractor: MetadataExtractor;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
    this.metadataExtractor = MetadataExtractor.getInstance();
    this.fileWatcherService = FileWatcherService.getInstance();
  }

  public static getInstance(): IndexingService {
    if (!IndexingService.instance) {
      IndexingService.instance = new IndexingService();
    }
    return IndexingService.instance;
  }

  /**
   * Initializes the indexing system
   */
  public async initialize(): Promise<void> {
    await this.dbService.initialize();
    this.setupFileWatcher();
    await this.indexWorkspace();
  }

  /**
   * Sets up file watchers using the shared FileWatcherService
   */
  private setupFileWatcher(): void {
    this.fileWatcherService.registerTypstCallback(INDEXING_SERVICE_ID, {
      onDidChange: async (uri) => {
        await this.updateFileInDatabase(uri);
      },
      onDidCreate: async (uri) => {
        await this.updateFileInDatabase(uri);
      },
      onDidDelete: async (uri) => {
        await this.dbService.deleteFile(uri.fsPath);
      },
    });
  }

  /**
   * Updates a file in the database with fresh metadata
   */
  public async updateFileInDatabase(uri: vscode.Uri): Promise<void> {
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
   * Ensures a file is indexed in the database
   */
  public async ensureFileIndexed(fileUri: vscode.Uri): Promise<void> {
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
   * Refreshes the entire workspace index
   */
  public async refreshAll(): Promise<void> {
    await this.indexWorkspace();
  }

  /**
   * Refreshes a specific file in the index
   */
  public async refreshFile(fileUri: vscode.Uri): Promise<void> {
    await this.updateFileInDatabase(fileUri);
  }

  /**
   * Gets the database service for read operations
   */
  public getDatabaseService(): DatabaseService {
    return this.dbService;
  }

  /**
   * Disposes resources
   */
  public async dispose(): Promise<void> {
    this.fileWatcherService.unregisterTypstCallback(INDEXING_SERVICE_ID);
    await this.dbService.dispose();
  }
}