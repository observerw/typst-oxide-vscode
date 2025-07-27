import * as vscode from "vscode";

export interface FileWatcherCallback {
  onDidChange?: (uri: vscode.Uri) => void | Promise<void>;
  onDidCreate?: (uri: vscode.Uri) => void | Promise<void>;
  onDidDelete?: (uri: vscode.Uri) => void | Promise<void>;
}

export class FileWatcherService {
  private static instance: FileWatcherService;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private typstCallbacks: Map<string, FileWatcherCallback> = new Map();
  private settingsWatcher: vscode.FileSystemWatcher | undefined;
  private settingsCallbacks: Map<string, FileWatcherCallback> = new Map();
  private repositoryWatcher: vscode.FileSystemWatcher | undefined;
  private repositoryCallbacks: Map<string, FileWatcherCallback> = new Map();

  private constructor() {
    this.setupTypstFileWatcher();
    this.setupSettingsFileWatcher();
    this.setupRepositoryWatcher();
  }

  public static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }

  /**
   * Sets up the shared watcher for .typ files
   */
  private setupTypstFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.typ");

    this.fileWatcher.onDidChange(async (uri) => {
      for (const callback of this.typstCallbacks.values()) {
        if (callback.onDidChange) {
          try {
            await callback.onDidChange(uri);
          } catch (error) {
            console.error('Error in file change callback:', error);
          }
        }
      }
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      for (const callback of this.typstCallbacks.values()) {
        if (callback.onDidCreate) {
          try {
            await callback.onDidCreate(uri);
          } catch (error) {
            console.error('Error in file create callback:', error);
          }
        }
      }
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      for (const callback of this.typstCallbacks.values()) {
        if (callback.onDidDelete) {
          try {
            await callback.onDidDelete(uri);
          } catch (error) {
            console.error('Error in file delete callback:', error);
          }
        }
      }
    });
  }

  /**
   * Sets up watcher for settings files
   */
  private setupSettingsFileWatcher(): void {
    this.settingsWatcher = vscode.workspace.createFileSystemWatcher("**/.typst-oxide/settings.toml");

    this.settingsWatcher.onDidChange(async (uri) => {
      for (const callback of this.settingsCallbacks.values()) {
        if (callback.onDidChange) {
          try {
            await callback.onDidChange(uri);
          } catch (error) {
            console.error('Error in settings change callback:', error);
          }
        }
      }
    });

    this.settingsWatcher.onDidCreate(async (uri) => {
      for (const callback of this.settingsCallbacks.values()) {
        if (callback.onDidCreate) {
          try {
            await callback.onDidCreate(uri);
          } catch (error) {
            console.error('Error in settings create callback:', error);
          }
        }
      }
    });

    this.settingsWatcher.onDidDelete(async (uri) => {
      for (const callback of this.settingsCallbacks.values()) {
        if (callback.onDidDelete) {
          try {
            await callback.onDidDelete(uri);
          } catch (error) {
            console.error('Error in settings delete callback:', error);
          }
        }
      }
    });
  }

  /**
   * Sets up watcher for repository directory
   */
  private setupRepositoryWatcher(): void {
    this.repositoryWatcher = vscode.workspace.createFileSystemWatcher("**/.typst-oxide");

    this.repositoryWatcher.onDidCreate(async (uri) => {
      for (const callback of this.repositoryCallbacks.values()) {
        if (callback.onDidCreate) {
          try {
            await callback.onDidCreate(uri);
          } catch (error) {
            console.error('Error in repository create callback:', error);
          }
        }
      }
    });

    this.repositoryWatcher.onDidDelete(async (uri) => {
      for (const callback of this.repositoryCallbacks.values()) {
        if (callback.onDidDelete) {
          try {
            await callback.onDidDelete(uri);
          } catch (error) {
            console.error('Error in repository delete callback:', error);
          }
        }
      }
    });
  }

  /**
   * Registers a callback for .typ file events
   */
  public registerTypstCallback(id: string, callback: FileWatcherCallback): void {
    this.typstCallbacks.set(id, callback);
  }

  /**
   * Unregisters a callback for .typ file events
   */
  public unregisterTypstCallback(id: string): void {
    this.typstCallbacks.delete(id);
  }

  /**
   * Registers a callback for settings file events
   */
  public registerSettingsCallback(id: string, callback: FileWatcherCallback): void {
    this.settingsCallbacks.set(id, callback);
  }

  /**
   * Unregisters a callback for settings file events
   */
  public unregisterSettingsCallback(id: string): void {
    this.settingsCallbacks.delete(id);
  }

  /**
   * Registers a callback for repository directory events
   */
  public registerRepositoryCallback(id: string, callback: FileWatcherCallback): void {
    this.repositoryCallbacks.set(id, callback);
  }

  /**
   * Unregisters a callback for repository directory events
   */
  public unregisterRepositoryCallback(id: string): void {
    this.repositoryCallbacks.delete(id);
  }

  /**
   * Disposes all watchers
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    if (this.settingsWatcher) {
      this.settingsWatcher.dispose();
    }
    if (this.repositoryWatcher) {
      this.repositoryWatcher.dispose();
    }
    this.typstCallbacks.clear();
    this.settingsCallbacks.clear();
    this.repositoryCallbacks.clear();
  }
}