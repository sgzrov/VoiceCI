#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_SOURCE="$HOME/.config/voiceci/.env.local"

cd "$PROJECT_ROOT"

echo "==> Setting up VoiceCI worktree in $PROJECT_ROOT"

# ── 1. .env.local ───────────────────────────────────────────────────────────

if [ -f ".env.local" ]; then
  echo "    .env.local already exists, skipping"
else
  # Try to copy from another worktree first
  COPIED=false
  while IFS= read -r line; do
    WT_PATH="$(echo "$line" | awk '{print $1}')"
    if [ "$WT_PATH" != "$PROJECT_ROOT" ] && [ -f "$WT_PATH/.env.local" ]; then
      cp "$WT_PATH/.env.local" .env.local
      echo "    Copied .env.local from $WT_PATH"
      COPIED=true
      break
    fi
  done < <(git worktree list 2>/dev/null || true)

  # Fall back to centralized env file
  if [ "$COPIED" = false ]; then
    if [ -f "$ENV_SOURCE" ]; then
      cp "$ENV_SOURCE" .env.local
      echo "    Copied .env.local from $ENV_SOURCE"
    else
      echo "    ERROR: No .env.local found."
      echo "    Create one at $ENV_SOURCE with your secrets, then re-run this script."
      exit 1
    fi
  fi
fi

# ── 2. Install dependencies ─────────────────────────────────────────────────

echo "==> Installing dependencies..."
pnpm install

# ── 3. Build all packages ───────────────────────────────────────────────────

echo "==> Building all packages..."
pnpm build

# ── 4. Create .context directory ─────────────────────────────────────────────

if [ ! -d ".context" ]; then
  mkdir -p .context
  touch .context/notes.md .context/todos.md
  echo "    Created .context/ directory"
else
  echo "    .context/ already exists, skipping"
fi

echo ""
echo "==> Setup complete!"
echo "    Worktree is ready at $PROJECT_ROOT"
