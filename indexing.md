# Indexing Feature

The indexing feature is designed to index the typst-oxide codebase for faster metadata/wikilink lookups.

Steps:

- Create a new database using `IndexDB` API.
- For each `.typ` file in the codebase:
  - execute `typst query <file> "metadata" --field value --one` to get a valid json string representing the metadata.
  - store the metadata in the database.
  - match all wikilinks in the file and store them in the database for quick lookups.
- When any `.typ` file changed (e.g., added, modified, or deleted), update the database accordingly.

Requirements:

- Integrate with existing code, do not reinvent everything.
