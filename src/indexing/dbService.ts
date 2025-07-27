import * as vscode from "vscode";
import { Level } from "level";
import * as path from "path";

export interface FileMetadata {
  filePath: string;
  lastModified: number;
  metadata: any;
  aliases: string[];
  wikilinks: WikiLink[];
  labels: Label[];
  headings: Heading[];
}

export interface WikiLink {
  sourceFile: string;
  targetFile: string;
  label?: string;
  alias?: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface Label {
  name: string;
  filePath: string;
  position: { line: number; character: number };
  type: "label" | "heading" | "comment";
}

export interface Heading {
  text: string;
  level: number;
  filePath: string;
  position: { line: number; character: number };
}

// LevelDB-based database implementation for persistent storage
export class DatabaseService {
  private static instance: DatabaseService;
  private db: Level<string, FileMetadata> | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error("No workspace folder found");
      }

      const dbPath = path.join(workspaceFolder.uri.fsPath, ".typst-oxide", "leveldb");
      this.db = new Level(dbPath, { valueEncoding: "json" });

      this.isInitialized = true;
      console.log("Typst Oxide LevelDB initialized successfully");
    } catch (error) {
      console.error("Failed to initialize LevelDB:", error);
      throw error;
    }
  }

  public async upsertFile(fileData: FileMetadata): Promise<void> {
    if (!this.db) {throw new Error("Database not initialized");}
    await this.db.put(fileData.filePath, fileData);
  }

  public async getFile(filePath: string): Promise<FileMetadata | null> {
    if (!this.db) {throw new Error("Database not initialized");}
    try {
      return await this.db.get(filePath);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  public async getAllFiles(): Promise<FileMetadata[]> {
    if (!this.db) {throw new Error("Database not initialized");}
    const files: FileMetadata[] = [];
    for await (const [, value] of this.db.iterator()) {
      files.push(value);
    }
    return files;
  }

  public async deleteFile(filePath: string): Promise<void> {
    if (!this.db) {throw new Error("Database not initialized");}
    await this.db.del(filePath);
  }

  public async getFilesWithWikilinksTo(targetFile: string): Promise<FileMetadata[]> {
    if (!this.db) {throw new Error("Database not initialized");}
    const files: FileMetadata[] = [];
    for await (const [, value] of this.db.iterator()) {
      if (value.wikilinks.some((link) => link.targetFile === targetFile)) {
        files.push(value);
      }
    }
    return files;
  }

  public async getLabelsInFile(filePath: string): Promise<Label[]> {
    const file = await this.getFile(filePath);
    return file ? file.labels : [];
  }

  public async searchLabels(query: string): Promise<Label[]> {
    if (!this.db) {throw new Error("Database not initialized");}
    const matchingLabels: Label[] = [];
    for await (const [, file] of this.db.iterator()) {
      const labels = file.labels.filter((label) =>
        label.name.toLowerCase().includes(query.toLowerCase())
      );
      matchingLabels.push(...labels);
    }
    return matchingLabels;
  }

  public async getHeadingsInFile(filePath: string): Promise<Heading[]> {
    const file = await this.getFile(filePath);
    return file ? file.headings : [];
  }

  public async isFileIndexed(filePath: string): Promise<boolean> {
    try {
      await this.getFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  public async getLastModified(filePath: string): Promise<number | null> {
    const file = await this.getFile(filePath);
    return file ? file.lastModified : null;
  }

  /**
   * Gets all files that have the specified alias
   */
  public async getFilesByAlias(alias: string): Promise<FileMetadata[]> {
    if (!this.db) {throw new Error("Database not initialized");}
    const matchingFiles: FileMetadata[] = [];
    for await (const [, file] of this.db.iterator()) {
      if (file.aliases && file.aliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
        matchingFiles.push(file);
      }
    }
    return matchingFiles;
  }

  /**
   * Searches for files by alias (partial match)
   */
  public async searchFilesByAlias(query: string): Promise<FileMetadata[]> {
    if (!this.db) {throw new Error("Database not initialized");}
    const matchingFiles: FileMetadata[] = [];
    const lowerQuery = query.toLowerCase();
    
    for await (const [, file] of this.db.iterator()) {
      if (file.aliases && file.aliases.some(alias => alias.toLowerCase().includes(lowerQuery))) {
        matchingFiles.push(file);
      }
    }
    return matchingFiles;
  }

  public async dispose(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}
