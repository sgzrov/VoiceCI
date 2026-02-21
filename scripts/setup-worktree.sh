#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_LOCAL_SOURCE="$HOME/.config/voiceci/.env.local"
ENV_SOURCE="$HOME/.config/voiceci/.env"

cd "$PROJECT_ROOT"

echo "==> Setting up VoiceCI worktree in $PROJECT_ROOT"

# ── 1. Copy env files ─────────────────────────────────────────────────────────

copy_env_file() {
  local filename="$1"
  local fallback="$2"

  if [ -f "$filename" ]; then
    echo "    $filename already exists, skipping"
    return
  fi

  # Try to copy from another worktree first
  local copied=false
  while IFS= read -r line; do
    local wt_path
    wt_path="$(echo "$line" | awk '{print $1}')"
    if [ "$wt_path" != "$PROJECT_ROOT" ] && [ -f "$wt_path/$filename" ]; then
      cp "$wt_path/$filename" "$filename"
      echo "    Copied $filename from $wt_path"
      copied=true
      break
    fi
  done < <(git worktree list 2>/dev/null || true)

  # Fall back to centralized env file
  if [ "$copied" = false ]; then
    if [ -f "$fallback" ]; then
      cp "$fallback" "$filename"
      echo "    Copied $filename from $fallback"
    elif [ "$filename" = ".env.local" ]; then
      echo "    ERROR: No .env.local found."
      echo "    Create one at $fallback with your secrets, then re-run this script."
      exit 1
    else
      cp .env.example "$filename"
      echo "    Created $filename from .env.example (fill in your secrets)"
    fi
  fi
}

copy_env_file ".env.local" "$ENV_LOCAL_SOURCE"
copy_env_file ".env" "$ENV_SOURCE"

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

# ── 5. Check voice testing env vars ────────────────────────────────────────

echo "==> Checking voice testing keys..."
VOICE_MISSING=()
for key in ELEVENLABS_API_KEY DEEPGRAM_API_KEY; do
  val="$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2-)"
  if [ -z "$val" ]; then
    VOICE_MISSING+=("$key")
  fi
done

if [ ${#VOICE_MISSING[@]} -gt 0 ]; then
  echo "    Missing voice keys in .env (needed for voice adapters):"
  for key in "${VOICE_MISSING[@]}"; do
    echo "      - $key"
  done
  echo "    Voice testing will not work until these are set."
else
  echo "    Core voice keys present (ElevenLabs, Deepgram)"
fi

echo ""
echo "==> Setup complete!"
echo "    Worktree is ready at $PROJECT_ROOT"
