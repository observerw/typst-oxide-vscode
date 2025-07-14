# Justfile for typst-oxide-vscode project

# Default recipe - show available commands
default:
    @just --list

# Publish a new version with the specified version number
publish version:
    #!/usr/bin/env zsh
    set -euo pipefail
    
    # Validate version format (basic semver check)
    if ! echo "{{version}}" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$'; then
        echo "Error: Invalid version format. Please use semantic versioning (e.g., 1.0.0, 1.0.0-alpha.1)"
        exit 1
    fi
    
    echo "📦 Publishing version {{version}}..."
    
    # Check if working directory is clean
    if ! git diff-index --quiet HEAD --; then
        echo "Error: Working directory is not clean. Please commit or stash your changes first."
        exit 1
    fi
    
    # Update package.json version
    echo "📝 Updating package.json version to {{version}}..."
    sed -i '' 's/"version": "[^"]*"/"version": "{{version}}"/' package.json
    
    # Verify the change was made
    if ! grep -q '"version": "{{version}}"' package.json; then
        echo "Error: Failed to update version in package.json"
        exit 1
    fi
    
    # Stage and commit the version change
    echo "📋 Committing version update..."
    git add package.json
    git commit -m "chore: bump version to {{version}}" --allow-empty
    
    # Create and push the tag
    echo "🏷️  Creating git tag v{{version}}..."
    git tag -a "v{{version}}" -m "Release version {{version}}"
    
    echo "⬆️  Pushing changes and tag to remote..."
    git push origin main
    git push origin "v{{version}}"
    
    echo "✅ Successfully published version {{version}}!"
    echo "🔗 Tag: v{{version}}"

# Build the extension
build:
    npm run compile

# Run tests
test:
    npm test

# Install dependencies
install:
    npm install

# Watch mode for development
watch:
    npm run watch

# Clean build artifacts
clean:
    rm -rf dist/
    rm -rf out/

# Package the extension (requires vsce)
package:
    npx vsce package

# Show current version
version:
    @grep '"version"' package.json | sed 's/.*"version": "\([^"]*\)".*/\1/'

# Validate that the extension can be packaged
validate:
    npx vsce package --out /tmp/typst-oxide-test.vsix
    rm -f /tmp/typst-oxide-test.vsix
    echo "✅ Extension validation passed"
