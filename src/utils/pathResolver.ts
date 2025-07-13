import * as vscode from 'vscode';
import * as path from 'path';

export class PathResolver {
    /**
     * Resolves a file path relative to the current document
     */
    static resolveFilePath(currentDocumentUri: vscode.Uri, targetPath: string): vscode.Uri {
        // If the path is already absolute, use it as-is
        if (path.isAbsolute(targetPath)) {
            return vscode.Uri.file(targetPath);
        }

        // Get the directory of the current document
        const currentDir = path.dirname(currentDocumentUri.fsPath);
        
        // Resolve the relative path
        const resolvedPath = path.resolve(currentDir, targetPath);
        
        return vscode.Uri.file(resolvedPath);
    }

    /**
     * Ensures the file has a .typ extension if not specified
     */
    static ensureTypstExtension(filePath: string): string {
        if (!filePath.endsWith('.typ')) {
            return filePath + '.typ';
        }
        return filePath;
    }

    /**
     * Checks if a file exists
     */
    static async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets the workspace relative path for display purposes
     */
    static getWorkspaceRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        }
        return uri.fsPath;
    }
}