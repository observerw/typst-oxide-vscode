import * as vscode from "vscode";
import { WikiLinkProvider } from "../wikiLinkProvider";
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

  private constructor() {
    this.setupFileWatcher();
  }

  public static getInstance(): LinkDiscovery {
    if (!LinkDiscovery.instance) {
      LinkDiscovery.instance = new LinkDiscovery();
    }
    return LinkDiscovery.instance;
  }

  /**
   * Sets up file watchers to invalidate cache when files change
   */
  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.typ");
    
    this.fileWatcher.onDidChange(() => this.invalidateCache());
    this.fileWatcher.onDidCreate(() => this.invalidateCache());
    this.fileWatcher.onDidDelete(() => this.invalidateCache());
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
   * Gets all forward links from a file (links pointing out)
   */
  private async getForwardLinks(fileUri: vscode.Uri): Promise<LinkInfo[]> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const wikiLinks = WikiLinkProvider.parseWikiLinks(document);
      
      const forwardLinks: LinkInfo[] = [];

      for (const link of wikiLinks) {
        const targetFilePath = PathResolver.ensureTypstExtension(link.filePath);
        const targetUri = PathResolver.resolveFilePath(fileUri, targetFilePath);
        
        const targetExists = await PathResolver.fileExists(targetUri);
        let labelExists: boolean | undefined;

        if (targetExists && link.label) {
          try {
            const targetDocument = await vscode.workspace.openTextDocument(targetUri);
            const { LabelSearcher } = await import("../utils/labelSearcher.js");
            const searchResult = await LabelSearcher.findLabel(targetDocument, link.label);
            labelExists = searchResult.found;
          } catch {
            labelExists = false;
          }
        }

        forwardLinks.push({
          sourceFile: fileUri.fsPath,
          targetFile: targetUri.fsPath,
          label: link.label || undefined,
          range: link.range,
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
    const backwardLinks: LinkInfo[] = [];
    
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
      if (!workspaceFolder) {
        return [];
      }

      const allTypstFiles = await vscode.workspace.findFiles("**/*.typ");
      
      for (const typstFile of allTypstFiles) {
        if (typstFile.fsPath === fileUri.fsPath) {
          continue; // Skip the target file itself
        }

        try {
          const document = await vscode.workspace.openTextDocument(typstFile);
          const wikiLinks = WikiLinkProvider.parseWikiLinks(document);
          
          for (const link of wikiLinks) {
            const targetFilePath = PathResolver.ensureTypstExtension(link.filePath);
            const resolvedTargetUri = PathResolver.resolveFilePath(typstFile, targetFilePath);
            
            if (resolvedTargetUri.fsPath === fileUri.fsPath) {
              let labelExists: boolean | undefined;
              
              if (link.label) {
                try {
                  const { LabelSearcher } = await import("../utils/labelSearcher.js");
                  const searchResult = await LabelSearcher.findLabel(document, link.label);
                  labelExists = searchResult.found;
                } catch {
                  labelExists = false;
                }
              }

              backwardLinks.push({
                sourceFile: typstFile.fsPath,
                targetFile: fileUri.fsPath,
                label: link.label || undefined,
                range: link.range,
                exists: true, // Since we're reading the file
                labelExists,
              });
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      // Return empty array if workspace scanning fails
    }

    return backwardLinks;
  }

  /**
   * Refreshes the cache for a specific file
   */
  public async refreshFile(fileUri: vscode.Uri): Promise<void> {
    this.invalidateFile(fileUri.fsPath);
    await this.getFileLinks(fileUri);
  }

  /**
   * Refreshes the entire cache
   */
  public async refreshAll(): Promise<void> {
    this.invalidateCache();
  }

  /**
   * Disposes resources
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.invalidateCache();
  }
}