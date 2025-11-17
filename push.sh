#!/bin/bash

# Push script for ihale-api
# This script adds, commits, and pushes changes to GitHub

set -e  # Exit on error

echo "📤 Starting git push..."

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if there are changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo "ℹ️  No changes to commit."
    exit 0
fi

echo "➕ Adding all changes..."
git add .

echo "💾 Committing changes..."
git commit -m "changes"

echo "📤 Pushing to GitHub..."
git push

echo "✅ Push completed successfully!"

