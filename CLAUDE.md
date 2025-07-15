# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that provides wiki-style linking capabilities for Typst files, allowing users to create links between documents using `[[path/to/file]]` or `[[path/to/file:label]]` syntax.

## Build & Development Commands

### Core Commands

- `pnpm run compile` - Build the extension (type check, lint, bundle)
- `pnpm run watch` - Watch mode for development (runs both esbuild and TypeScript watch)
- `pnpm run package` - Production build for publishing
- `pnpm run test` - Run extension tests
- `pnpm run lint` - Run ESLint
- `pnpm run check-types` - TypeScript type checking only

### Development Workflow

1. Start watch mode: `pnpm run watch`
2. Press F5 in VS Code to open Extension Development Host
3. Open a .typ file to test wiki link functionality

## Architecture & Key Components

### Extension Entry Point

- `src/extension.ts:10` - Main activation function, registers all providers

### Core Features

#### 1. Wiki Link Navigation (`src/wikiLinkProvider.ts`)

- **WikiLinkProvider**: Implements `DocumentLinkProvider` for `[[file]]` syntax
- **WikiLinkHandler**: Handles navigation with file creation for missing links
- **Features**: Click-to-navigate, auto-create missing files, label navigation

#### 2. Autocompletion (`src/completionProvider.ts`)

- **WikiLinkCompletionProvider**: Provides completions for:
  - File paths when typing `[[path`
  - Labels when typing `[[file:label`
- **Strategies**: Recursive file discovery, label extraction from Typst files

#### 3. Diagnostics (`src/diagnosticProvider.ts`)

- **WikiLinkDiagnosticManager**: Real-time validation with debounced updates
- **Features**: Broken link detection, missing label warnings

#### 4. Label Detection (`src/utils/labelSearcher.ts`)

- **LabelSearcher**: Finds labels using multiple strategies:
  - Typst labels: `<label-name>` syntax
  - Headings: `= Title`, `== Subtitle`, etc.

#### 5. Path Resolution (`src/utils/pathResolver.ts`)

- **PathResolver**: Handles relative/absolute paths, workspace navigation

#### 6. Find References (`src/findReferencesProvider.ts`)

- **FindReferencesProvider**: Implements `ReferenceProvider` for finding references
- **Features**: Find all references to labels and headings across workspace
- **Usage**: Right-click on label or heading → "Find All References"

### File Structure

```text
src/
├── extension.ts                 # Main extension activation
├── wikiLinkProvider.ts          # Document links & navigation
├── completionProvider.ts        # Autocompletion logic
├── diagnosticProvider.ts        # Link validation
├── findReferencesProvider.ts    # Find references for labels/headings
└── utils/
    ├── labelSearcher.ts         # Label discovery & navigation
    └── pathResolver.ts          # Path utilities
```

## Build System

- **esbuild.js**: Production bundling with VS Code problem matcher
- **TypeScript**: Strict type checking
- **Output**: `dist/extension.js` (bundled CommonJS)

## Testing

- `src/test/extension.test.ts`: Basic extension tests
- Uses `@vscode/test-electron` for integration testing

## Extension Configuration

- **Language**: Registers "typst" language for .typ files
- **Activation**: `onLanguage:typst` - activates when .typ files are opened
- **Commands**: Single hello world command registered (template)

## Key Patterns & Conventions

### Error Handling

- User-friendly error messages with action buttons
- File creation dialogs for missing links
- Label addition prompts for missing labels

### Performance

- Debounced diagnostic updates (500ms)
- Cancellation token support for long operations
- Efficient file system operations

### Navigation Logic

1. Parse `[[file:label]]` syntax
2. Resolve relative paths against current file
3. Handle file creation if missing
4. Navigate to labels using multi-strategy search
5. Provide quick fixes for common issues

## TODO

### Details

Label: In typst, label is a name wrapped in `<>` syntax, e.g., `<my-label>`. A label's name can contain letters, numbers, `_`, `-`, `:`, and `...`.

- Wikilink `[[path/to/file]]` link to the `path/to/file.typ` file in current workspace folder.
- Label link `[[path/to/file:label]]` link to a specific label in the target file.

See `test-files/main.typ` and `test-files/other.typ` for examples of wiki links and labels.

### Planned Features

High Priority

- [x] **Autocomplete for file paths** - Show available `.typ` files when typing `[[`
- [x] **Autocomplete for labels** - Show available labels in target file when typing `:`
- [x] **Find references for labels** - Show "Find All References" option when hovering over labels in target file
- [x] **Find references for Headings** - Show "Find All References" for headings in target file
- [x] **Link validation diagnostics** - Show warnings/errors for broken links
- [x] **Better error handling** - User-friendly messages for missing files/labels
- [x] **Create missing files** - Prompt to create file if wiki link target does not exist (only for `.typ`)
- [x] **Sidebar for links** - Show all links (forward and backward) in a sidebar view
- [ ] **Template support** - Allow users to create templates for new files with predefined content
- [ ] **Settings management** - Add configurable settings with schema validation and TOML export

Medium Priority

- [ ] **Preview on hover** - Show target file content preview when hovering over links
- [ ] **Bidirectional link detection** - Show backlinks (files that link to current file)
- [ ] **Go to definition** - Right-click menu option for wiki links
- [ ] **Symbol provider integration** - Show labels in outline/breadcrumbs

Low Priority

- [ ] **Link renaming** - Rename links when files are moved/renamed
- [ ] **Batch link updates** - Update all links when file structure changes
- [ ] **Custom label formats** - Support different label syntaxes (headings, comments, etc.)
- [ ] **Link graph visualization** - Show connections between files
- [ ] **Export link map** - Generate documentation of all wiki links

Technical Improvements

- [ ] **Performance optimization** - Cache file scanning results
- [ ] **Configuration options** - Allow users to customize link patterns
- [ ] **Better regex patterns** - Handle edge cases in wiki link syntax
- [ ] **Unit tests** - Add comprehensive test coverage
- [ ] **Integration tests** - Test with real Typst projects

### Settings Management

- **Settings Schema**: Uses `zod` for runtime type-safe settings validation
- **Configuration File**: Export/Load settings to/from `.typst-oxide/settings.toml` using `smol-toml`.
