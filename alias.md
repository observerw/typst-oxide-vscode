# Feature: Wikilink Alias

When user types a wikilink, current completion only shows all related file names.

However, in index database, each file can (optionally) have an `metadata` field, which can contain an `alias` field, consisting of an array of strings.

So, when user types a wikilink, the completion should not only show related file names, but also show files with related aliases.

Example:

```typst
// doc1.typ
#meta(
  alias: ["alias1", "alias2"]
)
```

```typst
// doc2.typ

[[al]]
// should show completion for doc1.typ
```
