#!/bin/bash

# Deploy script for ihale-api
# This script pulls latest changes from GitHub and restarts the application

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Git credentials
GIT_USERNAME="ismailulgac-23"
GIT_TOKEN="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"

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Get repository URL (if remote exists)
REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")

# If no remote, try to set it (user should update this)
if [ -z "$REPO_URL" ]; then
    echo "⚠️  No git remote found. Please set up git remote first."
    echo "   Example: git remote add origin https://github.com/ismailulgac-23/ihale-api.git"
    exit 1
fi

# Update remote URL with credentials if needed
if [[ "$REPO_URL" != *"@"* ]]; then
    # Replace https://github.com/ with https://username:token@github.com/
    REPO_URL_WITH_CREDS=$(echo "$REPO_URL" | sed "s|https://github.com/|https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/|")
    # Temporarily update remote URL
    git remote set-url origin "$REPO_URL_WITH_CREDS"
fi

echo "📥 Pulling latest changes from GitHub..."
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
git pull origin "$BRANCH" || git pull origin main || git pull origin master

# Restore original remote URL (remove credentials)
if [[ "$REPO_URL" != *"@"* ]]; then
    git remote set-url origin "$REPO_URL"
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building TypeScript..."
npx tsc

echo "🔄 Restarting PM2 process..."
pm2 restart api || {
    echo "⚠️  PM2 process 'api' not found. Starting new process..."
    pm2 start dist/index.js --name api
}

echo "✅ Deployment completed successfully!"
echo "📊 Checking PM2 status..."
pm2 status

