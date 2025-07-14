import * as vscode from "vscode";
import * as path from "path";
import { LinkDiscovery, FileLinks, LinkInfo } from "./services/linkDiscovery.js";
import { PathResolver } from "./utils/pathResolver.js";

export class LinkSidebarProvider implements vscode.TreeDataProvider<LinkTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LinkTreeItem | undefined | null | void> = new vscode.EventEmitter<LinkTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<LinkTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private linkDiscovery: LinkDiscovery;
  private currentFile: string | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.linkDiscovery = LinkDiscovery.getInstance();
    this.setupEventListeners();
  }

  /**
   * Sets up event listeners for file changes
   */
  private setupEventListeners(): void {
    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === "typst") {
        this.currentFile = editor.document.fileName;
        this.refresh();
      }
    });

    // Listen for document changes to refresh links
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === "typst") {
        this.linkDiscovery.refreshFile(document.uri).then(() => {
          this.refresh();
        });
      }
    });

    // Listen for file system changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.linkDiscovery.refreshAll().then(() => {
        this.refresh();
      });
    });
  }

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for display
   */
  getTreeItem(element: LinkTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children for a tree item
   */
  async getChildren(element?: LinkTreeItem): Promise<LinkTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (element.contextValue === "category" && (element.linkInfo as any).links) {
      return (element.linkInfo as any).links.map((link: LinkInfo) => 
        new LinkTreeItem(
          link,
          vscode.TreeItemCollapsibleState.None,
          "link"
        )
      );
    }

    return [];
  }

  /**
   * Gets the root items for the tree
   */
  private async getRootItems(): Promise<LinkTreeItem[]> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.languageId !== "typst") {
      return [new LinkTreeItem(
        { label: "Open a .typ file to see links" } as any,
        vscode.TreeItemCollapsibleState.None,
        "message"
      )];
    }

    try {
      const fileLinks = await this.linkDiscovery.getFileLinks(activeEditor.document.uri);
      
      const items: LinkTreeItem[] = [];

      // Forward links section
      items.push(new LinkTreeItem(
        { 
          label: `Forward Links (${fileLinks.forwardLinks.length})`,
          links: fileLinks.forwardLinks
        } as any,
        vscode.TreeItemCollapsibleState.Expanded,
        "category",
        "arrow-right"
      ));

      // Backward links section
      items.push(new LinkTreeItem(
        { 
          label: `Backward Links (${fileLinks.backwardLinks.length})`,
          links: fileLinks.backwardLinks
        } as any,
        vscode.TreeItemCollapsibleState.Expanded,
        "category",
        "arrow-left"
      ));

      return items;
    } catch (error) {
      return [new LinkTreeItem(
        { label: "Error loading links" } as any,
        vscode.TreeItemCollapsibleState.None,
        "message"
      )];
    }
  }
}

/**
 * Tree item for displaying links in the sidebar
 */
export class LinkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly linkInfo: LinkInfo | { label: string; links?: LinkInfo[] },
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly iconName?: string
  ) {
    super(
      typeof linkInfo === "object" 
        ? (linkInfo as LinkInfo).targetFile 
          ? path.basename((linkInfo as LinkInfo).targetFile)
          : (linkInfo as any).label
        : String(linkInfo),
      collapsibleState
    );

    if (contextValue === "category") {
      this.label = (linkInfo as any).label;
      this.iconPath = new vscode.ThemeIcon(iconName || "folder");
    } else if (contextValue === "link") {
      const link = linkInfo as LinkInfo;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(link.targetFile));
      const relativePath = workspaceFolder 
        ? path.relative(workspaceFolder.uri.fsPath, link.targetFile)
        : path.basename(link.targetFile);

      this.label = relativePath;
      this.description = link.label ? `#${link.label}` : "";
      
      // Set icon based on link status
      if (!link.exists) {
        this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
        this.tooltip = `File not found: ${relativePath}`;
      } else if (link.label && !link.labelExists) {
        this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("warningForeground"));
        this.tooltip = `Label "${link.label}" not found in ${relativePath}`;
      } else if (link.label && link.labelExists) {
        this.iconPath = new vscode.ThemeIcon("link");
        this.tooltip = `Navigate to label "${link.label}" in ${relativePath}`;
      } else {
        this.iconPath = new vscode.ThemeIcon("file");
        this.tooltip = `Navigate to ${relativePath}`;
      }

      // Add command for navigation
      this.command = {
        command: "typst-oxide.openWikiLink",
        title: "Open Link",
        arguments: [{
          uri: vscode.Uri.file(link.targetFile).toString(),
          label: link.label || ""
        }]
      };
    } else if (contextValue === "message") {
      this.label = (linkInfo as any).label;
      this.iconPath = new vscode.ThemeIcon("info");
    }
  }
}