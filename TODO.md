# TODO - Typst Wiki Links Extension

## Completed Features

- ✅ Basic wiki link detection and navigation
- ✅ Document link provider for `.typ` files
- ✅ File path resolution (relative/absolute)
- ✅ Label search and navigation

### Details

Label: In typst, label is a name wrapped in `<>` syntax, e.g., `<my-label>`. A label's name can contain letters, numbers, `_`, `-`, `:`, and `..`.

- Wikilink `[[path/to/file]]` link to the `path/to/file.typ` file in current workspace folder.
- Label link `[[path/to/file:label]]` link to a specific label in the target file.

See `test-files/main.typ` and `test-files/other.typ` for examples of wiki links and labels.

## Planned Features

### High Priority

- [x] **Autocomplete for file paths** - Show available `.typ` files when typing `[[`
- [ ] **Autocomplete for labels** - Show available labels in target file when typing `:`
- [x] **Link validation diagnostics** - Show warnings/errors for broken links
- [x] **Better error handling** - User-friendly messages for missing files/labels

### Medium Priority

- [ ] **Preview on hover** - Show target file content preview when hovering over links
- [ ] **Bidirectional link detection** - Show backlinks (files that link to current file)
- [ ] **Go to definition** - Right-click menu option for wiki links
- [ ] **Symbol provider integration** - Show labels in outline/breadcrumbs

### Low Priority

- [ ] **Link renaming** - Rename links when files are moved/renamed
- [ ] **Batch link updates** - Update all links when file structure changes
- [ ] **Custom label formats** - Support different label syntaxes (headings, comments, etc.)
- [ ] **Link graph visualization** - Show connections between files
- [ ] **Export link map** - Generate documentation of all wiki links

## Technical Improvements

- [ ] **Performance optimization** - Cache file scanning results
- [ ] **Configuration options** - Allow users to customize link patterns
- [ ] **Better regex patterns** - Handle edge cases in wiki link syntax
- [ ] **Unit tests** - Add comprehensive test coverage
- [ ] **Integration tests** - Test with real Typst projects

## Known Issues

- None currently identified

## Ideas for Future Versions

- Support for external links (URLs)
- Integration with Typst compiler for semantic analysis
- Live preview of linked content
- Multi-workspace support
- Plugin system for custom link types
