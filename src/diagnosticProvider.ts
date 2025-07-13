import * as vscode from 'vscode';
import { WikiLinkProvider } from './wikiLinkProvider';
import { PathResolver } from './utils/pathResolver';
import { LabelSearcher } from './utils/labelSearcher';

export class WikiLinkDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    
    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('typst-wiki-links');
    }

    /**
     * Validates all wiki links in a document and provides diagnostics
     */
    async validateDocument(document: vscode.TextDocument): Promise<void> {
        if (document.languageId !== 'typst') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        
        try {
            const wikiLinks = WikiLinkProvider.parseWikiLinks(document);
            
            for (const link of wikiLinks) {
                const diagnostic = await this.validateWikiLink(document, link);
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }
            
        } catch (error) {
            console.error('Error validating wiki links:', error);
        }
        
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Validates a single wiki link
     */
    private async validateWikiLink(
        document: vscode.TextDocument, 
        link: { filePath: string; label: string; range: vscode.Range }
    ): Promise<vscode.Diagnostic | null> {
        
        // Resolve the target file path
        const filePathWithExt = PathResolver.ensureTypstExtension(link.filePath);
        const targetUri = PathResolver.resolveFilePath(document.uri, filePathWithExt);
        
        // Check if target file exists
        const fileExists = await PathResolver.fileExists(targetUri);
        if (!fileExists) {
            return new vscode.Diagnostic(
                link.range,
                `File not found: ${PathResolver.getWorkspaceRelativePath(targetUri)}`,
                vscode.DiagnosticSeverity.Error
            );
        }
        
        // Check if label exists in target file
        try {
            const targetDocument = await vscode.workspace.openTextDocument(targetUri);
            const labelResult = await LabelSearcher.findLabel(targetDocument, link.label);
            
            if (!labelResult.found) {
                return new vscode.Diagnostic(
                    link.range,
                    `Label "${link.label}" not found in ${PathResolver.getWorkspaceRelativePath(targetUri)}`,
                    vscode.DiagnosticSeverity.Warning
                );
            }
            
        } catch (error) {
            return new vscode.Diagnostic(
                link.range,
                `Error reading target file: ${PathResolver.getWorkspaceRelativePath(targetUri)}`,
                vscode.DiagnosticSeverity.Error
            );
        }
        
        return null; // No issues found
    }

    /**
     * Clears diagnostics for a document
     */
    clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    /**
     * Disposes of the diagnostic collection
     */
    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}

export class WikiLinkDiagnosticManager {
    private provider: WikiLinkDiagnosticProvider;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.provider = new WikiLinkDiagnosticProvider();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Validate when document is opened
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument(document => {
                this.provider.validateDocument(document);
            })
        );

        // Validate when document content changes (with debouncing)
        let timeout: NodeJS.Timeout | undefined;
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(() => {
                    this.provider.validateDocument(event.document);
                }, 500); // Debounce for 500ms
            })
        );

        // Clear diagnostics when document is closed
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(document => {
                this.provider.clearDiagnostics(document);
            })
        );

        // Validate all open documents when files are created/deleted/renamed
        this.disposables.push(
            vscode.workspace.onDidCreateFiles(() => {
                this.validateAllOpenDocuments();
            })
        );

        this.disposables.push(
            vscode.workspace.onDidDeleteFiles(() => {
                this.validateAllOpenDocuments();
            })
        );

        this.disposables.push(
            vscode.workspace.onDidRenameFiles(() => {
                this.validateAllOpenDocuments();
            })
        );
    }

    private async validateAllOpenDocuments(): Promise<void> {
        for (const document of vscode.workspace.textDocuments) {
            if (document.languageId === 'typst') {
                await this.provider.validateDocument(document);
            }
        }
    }

    /**
     * Manually trigger validation for all open documents
     */
    async validateAll(): Promise<void> {
        await this.validateAllOpenDocuments();
    }

    dispose(): void {
        this.provider.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
    }
}