# Typst-Oxide

A comprehensive VS Code extension for Typst that brings wiki-style bidirectional linking, smart autocompletion, and powerful navigation features to your Typst documents.

## Features

### 🔗 Wiki Links

Create bidirectional links between Typst files using simple wiki-style syntax:

- `[[path/to/file]]` - Link to another Typst file
- `[[path/to/file:label]]` - Link to a specific label within a file
- Relative and absolute paths supported
- Automatic file creation for missing links

### 🎯 Smart Autocompletion

- **File path completion**: Press `[[` and start typing to see available `.typ` files
- **Label completion**: After typing `:` in a wiki link, see all available labels in the target file
- **Context-aware suggestions**: Only shows valid files and labels from your workspace

### ⚡ Quick Navigation

- **Click-to-navigate**: Click on any wiki link to jump to the target
- **Label navigation**: Jump directly to specific labels within files
- **Smart error handling**: Friendly messages for missing files with creation prompts
- **Label suggestions**: Quick fixes when labels don't exist

### 🔍 Label Detection

Automatically detects and provides completions for:

- **Typst labels**: `<label-name>` syntax anywhere in your document
- **Headings**: `= Title`, `== Subtitle`, etc. automatically become labels
- **Custom labels**: Any valid Typst label syntax

### ✅ Link Validation

- **Real-time validation**: Instant feedback on broken links as you type
- **Missing file warnings**: Detects when linked files don't exist
- **Missing label warnings**: Detects when referenced labels don't exist
- **Quick fixes**: One-click solutions for common link issues

### 🔍 Find References

- **Label references**: Find all usages of any label across your workspace
- **Heading references**: Find all references to headings
- **Cross-file search**: See all files that reference a specific element
- **Right-click integration**: "Find All References" in context menu

### 🔄 Rename Support

- **Smart refactoring**: Rename files, labels, or headings and automatically update all references
- **Cross-file updates**: Changes propagate across your entire workspace
- **Preserve link integrity**: Never break links during refactoring
- **F2 support**: Use F2 or right-click → "Rename Symbol"

### 📋 Sidebar Integration

- **Links overview**: See all forward and backward links for current file
- **Backlink detection**: Discover which files link to the current document
- **Quick navigation**: Jump between linked files from the sidebar
- **Real-time updates**: Automatically refreshes as you edit

### 📝 Template Support

- **File templates**: Create new files with predefined content
- **Customizable templates**: Define your own templates for different file types
- **Smart placeholders**: Template variables for common patterns
- **Quick creation**: Create files from wiki links with template selection

## Usage

### Basic Wiki Links

```typst
// Link to another file
See [[chapter/introduction]] for more details.

// Link to a specific label
As shown in [[math:euler-formula]], we have...
```

### Advanced Linking

```typst
// Link with custom display text
See [[chapter/introduction|the introduction]] for details.

// Link to heading (automatically detected)
Refer to [[basics:Introduction]] where Introduction is a heading.
```

### Autocompletion Workflow

1. **File completion**: Type `[[` followed by file path
2. **Label completion**: Type `:` after file path for label suggestions
3. **Selection**: Choose from dropdown or continue typing
4. **Validation**: Real-time feedback on link validity

### Supported Label Types

```typst
// Explicit Typst labels
$ e^(i pi) + 1 = 0 $ <euler-formula>

// Headings become labels automatically
= Introduction <intro>
== Getting Started

// Any element can be labeled
#figure(
  image("diagram.png"),
  caption: [System Architecture]
) <system-diagram>
```

## Requirements

- **Visual Studio Code**: 1.74.0 or higher
- **Language**: Typst files (`.typ` extension)
- **Dependencies**: None (all features work out of the box)

## Extension Settings

This extension currently works out of the box with sensible defaults. Settings management with TOML configuration is planned for future releases.

## Examples

### Project Structure

```text
my-book/
├── main.typ
├── chapter/
│   ├── introduction.typ
│   ├── basics.typ
│   └── advanced.typ
├── figures/
│   └── diagrams.typ
└── templates/
    └── chapter-template.typ
```

### Cross-References

In `main.typ`:

```typst
= My Book

See [[chapter/introduction]] for an overview.
The [[chapter/basics:installation]] section covers setup.
Check [[figures/diagrams:system-architecture]] for visuals.
```

In `chapter/introduction.typ`:

```typst
= Introduction

Welcome to my book. We'll cover:
- [[chapter/basics:Installation]] - Getting started
- [[chapter/advanced:Advanced Topics]] - Complex concepts
```

### Label References

In `chapter/basics.typ`:

```typst
= Installation <installation>

## System Requirements <system-reqs>

### Windows Setup <windows-setup>

Here's how to install on Windows...

#figure(
  image("windows-install.png"),
  caption: [Windows Installation Steps]
) <windows-screenshot>
```

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm package manager

### Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Start development mode: `pnpm run watch`
4. Press F5 in VS Code to open Extension Development Host
5. Open a .typ file to test wiki link functionality

### Build Commands

- `pnpm run compile` - Build the extension (type check, lint, bundle)
- `pnpm run watch` - Watch mode for development (runs both esbuild and TypeScript watch)
- `pnpm run package` - Production build for publishing
- `pnpm run test` - Run extension tests
- `pnpm run lint` - Run ESLint
- `pnpm run check-types` - TypeScript type checking only

### Architecture Overview

The extension is built with TypeScript and provides:

- **WikiLinkProvider**: Implements `DocumentLinkProvider` for `[[file]]` syntax
- **WikiLinkCompletionProvider**: Autocompletion for file paths and labels
- **WikiLinkDiagnosticManager**: Real-time validation with debounced updates
- **FindReferencesProvider**: Find all references to labels and headings
- **LabelSearcher**: Multi-strategy label discovery and navigation
- **PathResolver**: Handles relative/absolute paths and workspace navigation
- **RenameProvider**: Smart refactoring across files and labels

### Key Components

```text
src/
├── extension.ts                 # Main extension activation
├── wikiLinkProvider.ts          # Document links & navigation
├── completionProvider.ts        # Autocompletion logic
├── diagnosticProvider.ts        # Link validation
├── findReferencesProvider.ts    # Find references for labels/headings
├── renameProvider.ts            # Rename support
└── utils/
    ├── labelSearcher.ts         # Label discovery & navigation
    └── pathResolver.ts          # Path utilities
```

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on the GitHub repository.

## License

MIT License - see LICENSE file for details.
