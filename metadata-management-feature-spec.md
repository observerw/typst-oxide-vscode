# Typst Document Metadata Management Feature Specification

## Overview

This feature introduces comprehensive metadata management capabilities for Typst documents within the VS Code extension. It leverages Typst's built-in metadata querying capabilities combined with SQLite database storage to provide persistent, searchable, and queryable metadata for all Typst documents in the workspace.

## Core Requirements

### 1. Metadata Extraction

**Command Integration:**

- Utilize `typst query <file> "metadata" --field value --one` to extract metadata
- Handle JSON parsing and validation of query results
- Support both standard and custom metadata fields
- Graceful handling of missing metadata (empty results)

**Metadata Schema:**

- Flexible JSON structure allowing arbitrary key-value pairs
- Standard fields: title, author, date, version, tags, description
- Custom fields: user-defined metadata properties
- Nested object support for complex metadata structures

### 2. SQLite Database Design

**Database Structure:**

```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_name TEXT NOT NULL,
    last_modified DATETIME NOT NULL,
    metadata_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    value_type TEXT NOT NULL, -- 'string', 'number', 'boolean', 'json'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(document_id, key)
);

CREATE INDEX idx_metadata_key ON metadata(key);
CREATE INDEX idx_metadata_value ON metadata(value);
CREATE INDEX idx_documents_path ON documents(file_path);
```

**Database Location:**

- Store in workspace root: `.typst-oxide/metadata.db`
- Git-ignore by default (add to .gitignore)
- Migration support for schema updates

### 3. Synchronization System

**File Watching:**

- Monitor all `.typ` files in workspace
- Debounced updates (500ms delay to avoid excessive queries)
- Handle file renames and deletions gracefully
- Batch processing for initial workspace scan

**Change Detection:**

- Hash-based change detection using metadata content
- Only update database when metadata actually changes
- Support for manual refresh/force update
- Background synchronization without blocking UI

### 4. VS Code Integration

**Commands:**

- `typst-oxide.metadata.refresh` - Refresh metadata for current file
- `typst-oxide.metadata.refreshAll` - Refresh metadata for entire workspace
- `typst-oxide.metadata.search` - Search metadata across all documents
- `typst-oxide.metadata.show` - Show metadata for current document

**UI Components:**

- **Metadata Sidebar:** Tree view showing all metadata keys/values for current file
- **Search Panel:** Quick pick interface for searching metadata across workspace
- **Status Bar:** Indicator showing sync status and last update time
- **Hover Provider:** Show metadata summary when hovering over document tabs

**Settings:**

```json
{
  "typst-oxide.metadata.enabled": true,
  "typst-oxide.metadata.autoSync": true,
  "typst-oxide.metadata.syncDelay": 500,
  "typst-oxide.metadata.showInOutline": true,
  "typst-oxide.metadata.maxSearchResults": 100,
  "typst-oxide.metadata.includeInWorkspaceSymbolSearch": true
}
```

## Advanced Features

### 1. Query Language

**Simple Queries:**

- Key-value exact matches: `author:"John Doe"`
- Partial matches: `title:*report*`
- Range queries: `date:>2024-01-01`
- Array contains: `tags:important`

**Complex Queries:**

- Boolean operations: `author:"John Doe" AND tags:important`
- Nested property access: `custom.project.status:active`
- Full-text search across all string values
- Regular expression support for advanced filtering

### 2. Metadata Templates

**Template System:**

- Define metadata templates in `.typst-oxide/templates/metadata.json`
- Support for required vs optional fields
- Field validation rules (type, format, range)
- Auto-completion for template fields

**Template Example:**

```json
{
  "report": {
    "title": {"type": "string", "required": true},
    "author": {"type": "string", "required": true},
    "date": {"type": "date", "required": true},
    "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
    "tags": {"type": "array", "items": {"type": "string"}},
    "department": {"type": "string", "enum": ["engineering", "marketing", "sales"]}
  }
}
```

### 3. Export Capabilities

**Export Formats:**

- JSON: Complete metadata dump with document references
- CSV: Flattened structure suitable for spreadsheet analysis
- Markdown: Human-readable documentation format
- SQL: Database backup and migration

**Export Options:**

- Filter by date range, file patterns, or metadata values
- Include/exclude specific metadata fields
- Batch export for multiple documents
- Scheduled exports for backup purposes

### 4. Integration with Existing Features

**Wiki Links Enhancement:**

- Show metadata preview when hovering over wiki links
- Filter autocomplete suggestions based on metadata tags
- Include metadata in find references results

**Diagnostics Integration:**

- Validate required metadata fields
- Check metadata schema compliance
- Warn about missing or invalid metadata

## Performance Considerations

### 1. Optimization Strategies

**Indexing:**

- Database indexes on frequently queried fields
- Full-text search index for string values
- Materialized views for complex queries

**Caching:**

- In-memory cache for recently accessed metadata
- Query result caching with TTL
- File content hashing to detect changes efficiently

**Batching:**

- Bulk insert/update operations
- Transaction-based updates for consistency
- Background processing for large workspaces

### 2. Resource Management

**Memory Usage:**

- Limit in-memory cache size (configurable)
- Stream large result sets instead of loading all at once
- Periodic garbage collection for unused cache entries

**CPU Usage:**

- Throttle metadata extraction during high system load
- Prioritize active documents over background files
- Parallel processing for initial workspace scan

## Error Handling & Recovery

### 1. Error Scenarios

**Typst Query Failures:**

- Handle missing `typst` binary gracefully
- Fallback for syntax errors in metadata queries
- Timeout handling for large documents

**Database Issues:**

- Corruption detection and repair tools
- Automatic backup creation before updates
- Migration support for schema changes

**File System Issues:**

- Handle permission errors for read/write operations
- Recovery from file deletion/recreation
- Network drive disconnection handling

### 2. User Feedback

**Error Notifications:**

- Clear error messages with actionable solutions
- Progress indicators for long-running operations
- Detailed logs for troubleshooting

**Recovery Options:**

- Manual database rebuild command
- Force refresh for individual files
- Reset to clean state option

## Security Considerations

### 1. Data Privacy

**Local Storage Only:**

- No external data transmission
- Encrypted storage option for sensitive metadata
- Workspace-specific isolation

**Access Control:**

- Respect file system permissions
- Optional read-only mode for shared workspaces
- Audit trail for metadata changes

### 2. Input Validation

**Metadata Validation:**

- Sanitize all metadata values before storage
- Limit key/value lengths to prevent abuse
- Reject suspicious or malformed metadata

## Testing Strategy

### 1. Unit Tests

**Database Operations:**

- CRUD operations for documents and metadata
- Query language parsing and execution
- Change detection and synchronization logic

**Typst Integration:**

- Metadata extraction from various document structures
- Error handling for malformed metadata
- Performance benchmarks for large documents

### 2. Integration Tests

**VS Code Extension:**

- Command registration and execution
- UI component functionality
- Settings validation and application

**End-to-End Tests:**

- Complete workflow from document creation to metadata search
- Workspace-wide synchronization scenarios
- Performance testing with large file sets

### 3. User Acceptance Testing

**Beta Testing:**

- Limited release to select users
- Feedback collection through surveys and issue reports
- Iterative improvement based on real-world usage

## Future Enhancements

### 1. Advanced Analytics

**Usage Patterns:**

- Most common metadata fields
- Document relationship graphs
- Collaboration patterns based on shared metadata

**Trend Analysis:**

- Metadata evolution over time
- Popular tags and categories
- Document lifecycle insights

### 2. Cloud Integration

**Sync Services:**

- Optional cloud backup for metadata
- Team collaboration features
- Cross-device synchronization

### 3. AI Integration

**Smart Suggestions:**

- Auto-complete metadata based on document content
- Smart tagging based on document analysis
- Template recommendations based on usage patterns

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

- Database schema design and implementation
- Basic metadata extraction and storage
- File watching and synchronization

### Phase 2: VS Code Integration (Week 3-4)

- Command registration and basic UI
- Settings configuration
- Error handling and user feedback

### Phase 3: Advanced Features (Week 5-6)

- Query language implementation
- Search functionality
- Export capabilities

### Phase 4: Polish & Optimization (Week 7-8)

- Performance optimization
- User experience improvements
- Comprehensive testing and bug fixes

## Success Metrics

### 1. Performance Metrics

- Metadata extraction time: <100ms per document
- Database query response: <50ms for simple queries
- Memory usage: <100MB for large workspaces
- Initial sync time: <30 seconds for 1000 documents

### 2. User Experience Metrics

- Feature adoption rate: >60% of active users
- User satisfaction score: >4.0/5.0
- Error rate: <1% of operations
- Feature usage analytics: queries per day, exports per week

### 3. Technical Metrics

- Test coverage: >80% for critical paths
- Code quality score: >8.0/10
- Documentation completeness: 100% public APIs documented
- Performance regression: 0% increase in baseline metrics

## Conclusion

This metadata management feature will significantly enhance the Typst development experience by providing powerful document organization, search, and analysis capabilities. The combination of Typst's native metadata support with a robust SQLite backend creates a foundation for advanced document management workflows while maintaining simplicity and performance.
