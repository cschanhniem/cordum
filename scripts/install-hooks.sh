#!/usr/bin/env bash
#
# Install git hooks for secret detection.
#
# Usage: bash scripts/install-hooks.sh
#
# Installs a pre-commit hook that runs gitleaks on staged files.
# If gitleaks is not installed, the hook prints a warning but
# does not block commits (defense in depth, not single point of failure).

set -euo pipefail

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="$HOOKS_DIR/pre-commit"

mkdir -p "$HOOKS_DIR"

cat > "$HOOK_FILE" << 'HOOKEOF'
#!/usr/bin/env bash
#
# Pre-commit hook: scan staged files for secrets using gitleaks.
# Install with: bash scripts/install-hooks.sh

if ! command -v gitleaks &>/dev/null; then
    echo "[WARN] gitleaks not installed. Skipping secret scan."
    echo "       Install: https://github.com/gitleaks/gitleaks#installing"
    exit 0
fi

gitleaks protect --staged --config .gitleaks.toml --verbose 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "=== SECRET DETECTED ==="
    echo "Commit blocked by gitleaks. Please remove the secret."
    echo ""
    echo "If this is a false positive, add an allowlist entry to .gitleaks.toml"
    echo "To bypass in emergency: git commit --no-verify (document justification)"
    echo ""
    exit 1
fi
HOOKEOF

chmod +x "$HOOK_FILE"
echo "Pre-commit hook installed at $HOOK_FILE"
