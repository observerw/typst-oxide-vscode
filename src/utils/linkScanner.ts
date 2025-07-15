import * as vscode from "vscode";
import * as path from "path";
import { PathResolver } from "./pathResolver";
import { WIKI_LINK_REGEX } from "../wikiLinkProvider";

export interface WikiLinkMatch {
  filePath: string;
  label?: string;
  alias?: string;
  range: vscode.Range;
  fullMatch: string;
  filePathRange: vscode.Range;
}

export interface FileWithLinks {
  uri: vscode.Uri;
  links: WikiLinkMatch[];
}

export class LinkScanner {
  // Use the exported regex from wikiLinkProvider

  /**
   * Scans a document for all wiki links
   */
  static async scanDocument(document: vscode.TextDocument): Promise<WikiLinkMatch[]> {
    const links: WikiLinkMatch[] = [];
    const text = document.getText();

    let match;
    WIKI_LINK_REGEX.lastIndex = 0;

    while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
      const fullMatch = match[0];
      const filePath = match[1].trim();
      const label = match[2] ? match[2].trim() : undefined;
      const alias = match[3] ? match[3].trim() : undefined;

      const fullMatchStart = match.index;
      const fullMatchEnd = match.index + fullMatch.length;

      // Calculate file path range within the full match
      const filePathStart = fullMatchStart + 2; // Skip "[["
      const filePathEnd = label 
        ? filePathStart + match[1].length 
        : fullMatchEnd - 2; // Skip "]]"

      const filePathRange = new vscode.Range(
        document.positionAt(filePathStart),
        document.positionAt(filePathEnd)
      );

      const range = new vscode.Range(
        document.positionAt(fullMatchStart),
        document.positionAt(fullMatchEnd)
      );

      links.push({
        filePath,
        label,
        alias,
        range,
        fullMatch,
        filePathRange,
      });
    }

    return links;
  }

  /**
   * Scans all .typ files in the workspace for wiki links
   */
  static async scanWorkspace(): Promise<FileWithLinks[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const files = await vscode.workspace.findFiles("**/*.typ", "**/node_modules/**");
    const results: FileWithLinks[] = [];

    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const links = await this.scanDocument(document);
        if (links.length > 0) {
          results.push({ uri: fileUri, links });
        }
      } catch (error) {
        // Skip files that can't be opened
        console.warn(`Failed to scan ${fileUri.fsPath}:`, error);
      }
    }

    return results;
  }

  /**
   * Finds all files that link to a specific target file
   */
  static async findFilesLinkingTo(targetUri: vscode.Uri): Promise<FileWithLinks[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const targetRelativePath = path.relative(workspaceFolder.uri.fsPath, targetUri.fsPath);
    const targetPathWithoutExt = targetRelativePath.replace(/\.typ$/, "");

    const allFilesWithLinks = await this.scanWorkspace();
    const linkingFiles: FileWithLinks[] = [];

    for (const fileWithLinks of allFilesWithLinks) {
      const relevantLinks = fileWithLinks.links.filter(link => {
        const resolvedPath = this.resolveLinkPath(fileWithLinks.uri, link.filePath);
        const resolvedRelativePath = path.relative(workspaceFolder.uri.fsPath, resolvedPath);
        const resolvedPathWithoutExt = resolvedRelativePath.replace(/\.typ$/, "");
        
        return resolvedPathWithoutExt === targetPathWithoutExt;
      });

      if (relevantLinks.length > 0) {
        linkingFiles.push({
          uri: fileWithLinks.uri,
          links: relevantLinks
        });
      }
    }

    return linkingFiles;
  }

  /**
   * Resolves a wiki link path to an absolute path
   */
  private static resolveLinkPath(sourceUri: vscode.Uri, linkPath: string): string {
    const filePathWithExt = PathResolver.ensureTypstExtension(linkPath);
    const targetUri = PathResolver.resolveFilePath(sourceUri, filePathWithExt);
    return targetUri.fsPath;
  }

  /**
   * Gets the old path pattern to search for when a file is renamed
   */
  static getOldPathPattern(oldUri: vscode.Uri, newUri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(oldUri);
    if (!workspaceFolder) {
      return oldUri.fsPath;
    }

    const oldRelativePath = path.relative(workspaceFolder.uri.fsPath, oldUri.fsPath);
    const oldPathWithoutExt = oldRelativePath.replace(/\.typ$/, "");
    
    // Return the path as it would appear in wiki links
    // Handle both relative and absolute path formats
    if (path.isAbsolute(oldPathWithoutExt)) {
      return oldPathWithoutExt;
    }
    
    // Normalize path separators for consistent matching
    return oldPathWithoutExt.replace(/\\/g, "/");
  }

  /**
   * Gets the new path to replace with when a file is renamed
   */
  static getNewPathPattern(newUri: vscode.Uri, sourceUri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(newUri);
    if (!workspaceFolder) {
      return newUri.fsPath;
    }

    const newRelativePath = path.relative(workspaceFolder.uri.fsPath, newUri.fsPath);
    const newPathWithoutExt = newRelativePath.replace(/\.typ$/, "");
    
    // Normalize path separators for consistent replacement
    return newPathWithoutExt.replace(/\\/g, "/");
  }
}