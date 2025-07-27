import { z } from 'zod';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileWatcherService } from './services/fileWatcherService';

const SETTINGS_SERVICE_ID = 'settings-manager';

export const SettingsSchema = z.object({
  'wiki-links': z.object({
    enabled: z.boolean().default(true),
    'file-extensions': z.array(z.string()).default(['.typ']),
    'max-depth': z.number().min(1).max(10).default(5),
    'ignore-patterns': z.array(z.string()).default([
      'node_modules/**',
      '.git/**',
      'target/**',
      'dist/**'
    ]),
    'case-sensitive': z.boolean().default(false),
    'allow-absolute-paths': z.boolean().default(true),
    'create-missing-files': z.boolean().default(true),
    'template-file': z.string().optional()
  }),
  labels: z.object({
    enabled: z.boolean().default(true),
    'detect-headings': z.boolean().default(true),
    'detect-typst-labels': z.boolean().default(true),
    'heading-levels': z.array(z.number()).default([1, 2, 3, 4, 5, 6]),
    'label-pattern': z.string().default('<([^>]+)>'),
    'allow-duplicate-labels': z.boolean().default(false)
  }),
  diagnostics: z.object({
    enabled: z.boolean().default(true),
    'update-delay': z.number().min(100).max(5000).default(500),
    'show-missing-file-warnings': z.boolean().default(true),
    'show-missing-label-warnings': z.boolean().default(true),
    severity: z.enum(['error', 'warning', 'info']).default('warning')
  }),
  completion: z.object({
    enabled: z.boolean().default(true),
    'trigger-characters': z.array(z.string()).default(['[', ':']),
    'max-suggestions': z.number().min(1).max(50).default(20),
    'show-file-icons': z.boolean().default(true),
    'include-file-content-preview': z.boolean().default(false)
  }),
  'find-references': z.object({
    enabled: z.boolean().default(true),
    'include-headings': z.boolean().default(true),
    'include-labels': z.boolean().default(true),
    'max-results': z.number().min(1).max(1000).default(100)
  }),
  ui: z.object({
    'show-backlinks': z.boolean().default(true),
    'show-forward-links': z.boolean().default(true),
    'link-decorations': z.boolean().default(true),
    'hover-preview': z.boolean().default(true),
    'preview-max-lines': z.number().min(1).max(100).default(10)
  })
});

export type Settings = z.infer<typeof SettingsSchema>;

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: Settings | null = null;
  private fileWatcherService: FileWatcherService;
  private onSettingsChangedEmitter = new vscode.EventEmitter<Settings>();

  public readonly onSettingsChanged = this.onSettingsChangedEmitter.event;

  private constructor() {
    this.fileWatcherService = FileWatcherService.getInstance();
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  public async loadSettings(): Promise<Settings> {
    const settingsPath = await this.findSettingsFile();
    
    if (settingsPath && fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const { parse } = await import('smol-toml');
        const parsed = parse(content);
        const result = SettingsSchema.parse(parsed);
        this.settings = result;
        this.setupWatcher(settingsPath);
        return result;
      } catch (error) {
        console.error('Failed to load settings:', error);
        vscode.window.showErrorMessage(
          'Invalid settings file. Using default settings.',
          'Open Settings'
        ).then(selection => {
          if (selection === 'Open Settings') {
            this.openSettingsFile();
          }
        });
      }
    }

    this.settings = SettingsSchema.parse({});
    return this.settings;
  }

  public getSettings(): Settings {
    if (!this.settings) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings;
  }

  public async reloadSettings(): Promise<Settings> {
    return this.loadSettings();
  }

  public async openSettingsFile(): Promise<void> {
    const settingsPath = await this.getSettingsPath();
    const uri = vscode.Uri.file(settingsPath);
    
    if (!fs.existsSync(settingsPath)) {
      await this.createDefaultSettingsFile(settingsPath);
    }
    
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }

  private async findSettingsFile(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const primaryFolder = workspaceFolders[0];
    const settingsPath = path.join(primaryFolder.uri.fsPath, '.typst-oxide', 'settings.toml');
    
    return settingsPath;
  }

  private async getSettingsPath(): Promise<string> {
    const settingsPath = await this.findSettingsFile();
    if (!settingsPath) {
      throw new Error('No workspace folder found');
    }
    return settingsPath;
  }

  private async createDefaultSettingsFile(settingsPath: string): Promise<void> {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const defaultSettings = SettingsSchema.parse({});
    const { stringify } = await import('smol-toml');
    const tomlContent = stringify(defaultSettings);
    
    const header = `# Typst Oxide Settings
# This file configures the Typst Oxide extension behavior.
# Changes are applied automatically when the file is saved.

`;
    
    fs.writeFileSync(settingsPath, header + tomlContent);
  }

  private setupWatcher(settingsPath: string): void {
    this.fileWatcherService.unregisterSettingsCallback(SETTINGS_SERVICE_ID);

    const settingsUri = vscode.Uri.file(settingsPath);
    
    this.fileWatcherService.registerSettingsCallback(SETTINGS_SERVICE_ID, {
      onDidChange: async () => {
        try {
          await this.reloadSettings();
          this.onSettingsChangedEmitter.fire(this.settings!);
        } catch (error) {
          console.error('Failed to reload settings:', error);
        }
      },
      onDidCreate: async () => {
        try {
          await this.reloadSettings();
          this.onSettingsChangedEmitter.fire(this.settings!);
        } catch (error) {
          console.error('Failed to reload settings:', error);
        }
      },
      onDidDelete: () => {
        this.settings = SettingsSchema.parse({});
        this.onSettingsChangedEmitter.fire(this.settings);
      },
    });
  }

  public dispose(): void {
    this.fileWatcherService.unregisterSettingsCallback(SETTINGS_SERVICE_ID);
    this.onSettingsChangedEmitter.dispose();
  }
}