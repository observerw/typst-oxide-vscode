# Typst-Oxide

A VS Code extension that adds powerful wiki-style linking capabilities to Typst files, enabling seamless navigation between documents and quick access to labels within files.

## Features

### 🔗 Wiki Links

Create links between Typst files using simple wiki-style syntax:

- `[[path/to/file]]` - Link to another Typst file
- `[[path/to/file:label]]` - Link to a specific label within a file

### 🎯 Smart Autocompletion

- **File path completion**: Press `[[` and start typing to see available `.typ` files
- **Label completion**: After typing `:` in a wiki link, see all available labels in the target file

### ⚡ Quick Navigation

- Click on any wiki link to navigate to the target file
- Jump directly to specific labels within files
- Automatic file creation for missing links
- Smart label suggestions when labels don't exist

### 🔍 Label Detection

Automatically detects and provides completions for:

- **Typst labels**: `<label-name>` syntax
- **Headings**: `= Title`, `== Subtitle`, etc.
- **Comments**: `// Important note` or `/* Block comment */`

### ✅ Link Validation

- Real-time validation of wiki links
- Warnings for broken file paths
- Warnings for missing labels
- Quick fixes for common issues

## Usage

### Basic Wiki Links

```typst
// Link to another file
See [[chapter/introduction]] for more details.

// Link to a specific label
As shown in [[math:euler-formula]], we have...
```

### Autocompletion

1. Type `[[` to start a wiki link
2. Start typing a file path to see completions
3. Type `:` after the file path to see label completions
4. Select from the suggestions or continue typing

### Supported Label Types

```typst
// Typst labels
$ e^(i pi) + 1 = 0 $ <euler-formula>

// Headings automatically become labels
= Introduction <intro>
This creates a label "Introduction"
```

## Requirements

- Visual Studio Code 1.74.0 or higher
- Typst files (`.typ` extension)
- No additional dependencies required

## Extension Settings

This extension currently doesn't add any custom settings. All features work out of the box with sensible defaults.

## Examples

### File Structure

```text
project/
├── main.typ
├── chapter/
│   ├── introduction.typ
│   └── conclusion.typ
└── math/
    └── formulas.typ
```

### Using Wiki Links

In `main.typ`:

```typst
= My Document

See [[chapter/introduction]] for the introduction.
Check [[math/formulas:euler-formula]] for the famous equation.
```

In `math/formulas.typ`:

```typst
= Mathematical Formulas

$ e^(i pi) + 1 = 0 $ <euler-formula>
```

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on the GitHub repository.

## License

MIT License - see LICENSE file for details.
