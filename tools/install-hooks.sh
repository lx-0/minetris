#!/bin/bash
#
# Installs git hooks for the MineCtris project.
# Usage: bash tools/install-hooks.sh
#
# Hooks are tracked in .githooks/ and activated via git config core.hooksPath.
# This avoids permission issues with the .git/hooks/ directory.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GITHOOKS_DIR="$REPO_ROOT/.githooks"

# Ensure hook scripts are executable
chmod +x "$GITHOOKS_DIR/pre-push"
chmod +x "$GITHOOKS_DIR/pre-commit"

# Point git to the tracked hooks directory
git -C "$REPO_ROOT" config core.hooksPath .githooks

echo "Git hooks installed successfully."
echo "  - pre-push: runs smoke test (tools/smoke-test.js) + secrets scan (tools/scan-secrets.sh)"
echo "  - pre-commit: runs secrets scan on staged files (tools/scan-secrets.sh --staged)"
