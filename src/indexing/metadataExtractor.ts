import * as cp from "child_process";
import { promises as fs } from "fs";
import * as vscode from "vscode";

export interface TypstMetadata {
  title?: string;
  author?: string | string[];
  date?: string;
  description?: string;
  keywords?: string[];
  [key: string]: any;
}

export interface ExtractedMetadata {
  filePath: string;
  lastModified: number;
  metadata: TypstMetadata;
  labels: Array<{
    name: string;
    position: { line: number; character: number };
    type: "label" | "heading" | "comment";
  }>;
  headings: Array<{
    text: string;
    level: number;
    position: { line: number; character: number };
  }>;
  wikilinks: Array<{
    targetFile: string;
    label?: string;
    alias?: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  }>;
}

export class MetadataExtractor {
  private static instance: MetadataExtractor;

  private constructor() {}

  public static getInstance(): MetadataExtractor {
    if (!MetadataExtractor.instance) {
      MetadataExtractor.instance = new MetadataExtractor();
    }
    return MetadataExtractor.instance;
  }

  /**
   * Extracts metadata from a typst file using the typst query command
   */
  public async extractMetadata(
    fileUri: vscode.Uri
  ): Promise<ExtractedMetadata | null> {
    try {
      const filePath = fileUri.fsPath;
      const stats = await fs.stat(filePath);

      // Check if file exists and is readable
      if (!(await this.fileExists(filePath))) {
        return null;
      }

      // Extract metadata using typst query
      const metadata = await this.queryTypstMetadata(filePath);

      // Parse file content for additional information
      const document = await vscode.workspace.openTextDocument(fileUri);
      const content = document.getText();

      const labels = this.extractLabels(content, filePath);
      const headings = this.extractHeadings(content, filePath);
      const wikilinks = this.extractWikilinks(content, filePath);

      return {
        filePath,
        lastModified: stats.mtime.getTime(),
        metadata,
        labels,
        headings,
        wikilinks,
      };
    } catch (error) {
      console.error(
        `Failed to extract metadata from ${fileUri.fsPath}:`,
        error
      );
      return null;
    }
  }

  /**
   * Queries typst for metadata using the command line
   */
  private async queryTypstMetadata(filePath: string): Promise<TypstMetadata> {
    return new Promise((resolve) => {
      const command = `typst query "${filePath}" "metadata" --field value --one`;

      cp.exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn(`Typst query failed for ${filePath}:`, error.message);
          resolve({});
          return;
        }

        if (stderr) {
          console.warn(`Typst query stderr for ${filePath}:`, stderr);
        }

        try {
          if (stdout.trim()) {
            const metadata = JSON.parse(stdout.trim());
            resolve(metadata);
          } else {
            resolve({});
          }
        } catch (parseError) {
          console.warn(
            `Failed to parse metadata JSON for ${filePath}:`,
            parseError
          );
          resolve({});
        }
      });
    });
  }

  /**
   * Extracts labels from typst content
   */
  private extractLabels(
    content: string,
    filePath: string
  ): Array<{
    name: string;
    position: { line: number; character: number };
    type: "label" | "heading" | "comment";
  }> {
    const labels: Array<{
      name: string;
      position: { line: number; character: number };
      type: "label" | "heading" | "comment";
    }> = [];

    const lines = content.split("\n");

    // Find actual Typst labels in <label> syntax
    const labelRegex = /<([^<>\s]+)>/g;
    let match;
    while ((match = labelRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineIndex = beforeMatch.split("\n").length - 1;
      const lineStart = beforeMatch.lastIndexOf("\n") + 1;
      const charIndex = match.index - lineStart + 1;

      labels.push({
        name: match[1],
        position: { line: lineIndex, character: charIndex },
        type: "label",
      });
    }

    // Find headings that can be used as labels
    const headingRegex = /^(=+)\s+(.+)$/gm;
    while ((match = headingRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineIndex = beforeMatch.split("\n").length - 1;
      const lineStart = beforeMatch.lastIndexOf("\n") + 1;
      const charIndex = match[1].length + 1;

      labels.push({
        name: match[2].trim(),
        position: { line: lineIndex, character: charIndex },
        type: "heading",
      });
    }

    // Find comments that might be used as labels
    const commentRegex = /^\s*\/\/\s*(.+)$/gm;
    while ((match = commentRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineIndex = beforeMatch.split("\n").length - 1;
      const lineStart = beforeMatch.lastIndexOf("\n") + 1;
      const charIndex =
        content.substring(lineStart, match.index).indexOf("//") + lineStart + 2;

      labels.push({
        name: match[1].trim(),
        position: { line: lineIndex, character: charIndex },
        type: "comment",
      });
    }

    return labels;
  }

  /**
   * Extracts headings from typst content
   */
  private extractHeadings(
    content: string,
    filePath: string
  ): Array<{
    text: string;
    level: number;
    position: { line: number; character: number };
  }> {
    const headings: Array<{
      text: string;
      level: number;
      position: { line: number; character: number };
    }> = [];

    const lines = content.split("\n");

    lines.forEach((line, lineIndex) => {
      const match = line.match(/^(=+)\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        headings.push({
          text,
          level,
          position: { line: lineIndex, character: match[1].length + 1 },
        });
      }
    });

    return headings;
  }

  /**
   * Extracts wikilinks from typst content
   */
  private extractWikilinks(
    content: string,
    filePath: string
  ): Array<{
    targetFile: string;
    label?: string;
    alias?: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  }> {
    const wikilinks: Array<{
      targetFile: string;
      label?: string;
      alias?: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }> = [];

    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = wikiLinkRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const linkContent = match[1];

      // Parse link content: file:label|alias
      const parts = linkContent.split(":");
      const filePart = parts[0];
      const labelPart = parts.length > 1 ? parts[1] : undefined;

      let targetFile = filePart.trim();
      let label: string | undefined;
      let alias: string | undefined;

      if (labelPart) {
        const labelParts = labelPart.split("|");
        label = labelParts[0].trim();
        alias = labelParts.length > 1 ? labelParts[1].trim() : undefined;
      }

      // Calculate position
      const beforeMatch = content.substring(0, match.index);
      const startLine = beforeMatch.split("\n").length - 1;
      const startChar = beforeMatch.length - beforeMatch.lastIndexOf("\n") - 1;

      const afterStart = beforeMatch.length + fullMatch.length;
      const endLine = content.substring(0, afterStart).split("\n").length - 1;
      const endChar =
        afterStart - content.substring(0, afterStart).lastIndexOf("\n") - 1;

      wikilinks.push({
        targetFile,
        label,
        alias,
        range: {
          start: { line: startLine, character: startChar },
          end: { line: endLine, character: endChar },
        },
      });
    }

    return wikilinks;
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Batch extracts metadata from multiple files in parallel
   */
  public async extractBatch(
    fileUris: vscode.Uri[]
  ): Promise<ExtractedMetadata[]> {
    const promises = fileUris.map(uri => this.extractMetadata(uri));
    const results = await Promise.all(promises);
    return results.filter((metadata): metadata is ExtractedMetadata => metadata !== null);
  }
}
