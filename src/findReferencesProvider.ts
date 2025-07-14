import * as vscode from "vscode";
import { WikiLinkProvider } from "./wikiLinkProvider";
import { LabelSearcher } from "./utils/labelSearcher";
import { PathResolver } from "./utils/pathResolver";

/**
 * Provides find references functionality for labels and headings in Typst files
 */
export class FindReferencesProvider implements vscode.ReferenceProvider {
  /**
   * Provides references for the given position in the document
   */
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    try {
      // Determine if we're looking at a label or heading
      const targetInfo = await this.determineTargetInfo(document, position);
      if (!targetInfo) {
        return [];
      }

      // Find all references across the workspace
      const references = await this.findAllReferences(targetInfo.name, targetInfo.type, token);
      return references;
    } catch (error) {
      console.error("Error in FindReferencesProvider:", error);
      return [];
    }
  }

  /**
   * Determines what type of target we're looking for (label or heading)
   */
  private async determineTargetInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{ name: string; type: 'label' | 'heading' } | null> {
    const line = document.lineAt(position);
    const lineText = line.text;

    // Check if it's a Typst label: <label-name>
    const labelRegex = /<([^<>\s]+)>/g;
    let match;
    while ((match = labelRegex.exec(lineText)) !== null) {
      const labelStart = line.range.start.character + match.index;
      const labelEnd = labelStart + match[0].length;
      
      if (position.character >= labelStart && position.character <= labelEnd) {
        return { name: match[1], type: 'label' };
      }
    }

    // Check if it's a heading: = Title, == Title, etc.
    const headingRegex = /^\s*=+\s*(.+)$/;
    const headingMatch = lineText.match(headingRegex);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      // Check if cursor is within the heading text
      const headingStart = lineText.indexOf(headingMatch[1]);
      const headingEnd = headingStart + headingMatch[1].length;
      
      if (position.character >= headingStart && position.character <= headingEnd) {
        return { name: headingText, type: 'heading' };
      }
    }

    return null;
  }

  /**
   * Finds all references to the target across the workspace
   */
  private async findAllReferences(
    targetName: string,
    targetType: 'label' | 'heading',
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const references: vscode.Location[] = [];

    // Get all Typst files in the workspace
    const typstFiles = await vscode.workspace.findFiles("**/*.typ");

    for (const fileUri of typstFiles) {
      if (token.isCancellationRequested) {
        break;
      }

      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const fileReferences = await this.findReferencesInFile(
          document,
          targetName,
          targetType
        );
        references.push(...fileReferences);
      } catch (error) {
        console.error(`Error processing file ${fileUri.fsPath}:`, error);
      }
    }

    return references;
  }

  /**
   * Finds references to the target within a single file
   */
  private async findReferencesInFile(
    document: vscode.TextDocument,
    targetName: string,
    targetType: 'label' | 'heading'
  ): Promise<vscode.Location[]> {
    const references: vscode.Location[] = [];
    
    // Parse all wiki links in this file
    const wikiLinks = WikiLinkProvider.parseWikiLinks(document);

    for (const wikiLink of wikiLinks) {
      if (!wikiLink.label) {
        continue; // Skip file-only links
      }

      // Normalize the label name for comparison
      const normalizedLabel = wikiLink.label.toLowerCase().trim();
      const normalizedTarget = targetName.toLowerCase().trim();

      // Check if this wiki link references our target
      if (normalizedLabel === normalizedTarget) {
        // Get the target file URI
        const targetFilePath = PathResolver.ensureTypstExtension(wikiLink.filePath);
        const targetUri = PathResolver.resolveFilePath(
          document.uri,
          targetFilePath
        );

        try {
          // Check if the target file exists
          const targetDocument = await vscode.workspace.openTextDocument(targetUri);
          
          // Verify the target exists in the target file based on type
          let targetFound = false;
          
          if (targetType === 'label') {
            const labelResult = await LabelSearcher.findLabel(targetDocument, targetName);
            targetFound = labelResult.found;
          } else if (targetType === 'heading') {
            // For headings, search for the heading text in the target file
            const text = targetDocument.getText();
            const lines = text.split('\n');
            
            for (const line of lines) {
              const headingMatch = line.match(/^\s*=+\s*(.+)$/);
              if (headingMatch) {
                const headingText = headingMatch[1].trim();
                if (headingText.toLowerCase() === targetName.toLowerCase()) {
                  targetFound = true;
                  break;
                }
              }
            }
          }
          
          if (targetFound) {
            // Create a location for this reference
            const location = new vscode.Location(
              document.uri,
              wikiLink.range
            );
            references.push(location);
          }
        } catch (error) {
          // Target file doesn't exist, skip this reference
          console.warn(`Target file not found: ${targetUri.fsPath}`);
        }
      }
    }

    return references;
  }
}