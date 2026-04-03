#!/usr/bin/env bash
# mt-setup: Automated Installer for Media Tracker

set -euo pipefail

echo "🚀 Starting Media Tracker Automated Setup..."
echo "==========================================="

# --- 1. Detect OS ---
OS_TYPE="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
fi

# --- 2. Check & Install Dependencies ---
install_deps() {
    echo "📦 Checking dependencies..."
    needed=()
    for cmd in jq fzf node npm curl; do
        if ! command -v "$cmd" &> /dev/null; then
            needed+=("$cmd")
        fi
    done

    if [ ${#needed[@]} -eq 0 ]; then
        echo "✅ All core dependencies (jq, fzf, node, etc.) are already installed."
    else
        echo "⚠️  Missing: ${needed[*]}"
        if [ "$OS_TYPE" == "macos" ]; then
            if ! command -v brew &> /dev/null; then
                echo "❌ Homebrew not found. Please install it from https://brew.sh first."
                exit 1
            fi
            echo "🍻 Installing via Homebrew..."
            brew install "${needed[@]}"
        elif [ "$OS_TYPE" == "linux" ]; then
            echo "🐧 Installing via APT..."
            sudo apt update && sudo apt install -y "${needed[@]}"
        else
            echo "❌ Unknown OS. Please install ${needed[*]} manually."
            exit 1
        fi
    fi
}

install_deps

# --- 3. Initialize Folders ---
TARGET_DIR="$HOME/Documents/Personal/Tracker"
BIN_DIR="$HOME/.local/bin"

echo "📂 Initializing project directories..."
mkdir -p "$TARGET_DIR/cache/anime" "$TARGET_DIR/cache/manga" "$TARGET_DIR/cache/tv" "$TARGET_DIR/cache/movie" "$TARGET_DIR/cache/book"
mkdir -p "$BIN_DIR"
mkdir -p "$HOME/.config/mt"

# --- 4. Install CLI Tools ---
echo "🛠 Installing CLI tools to $BIN_DIR..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../.local/bin"

if [ -d "$SCRIPT_DIR" ]; then
    cp -r "$SCRIPT_DIR"/* "$BIN_DIR/"
    chmod +x "$BIN_DIR"/mt-*
    echo "✅ CLI tools installed successfully."
else
    echo "⚠️  Warning: CLI source folder not found at $SCRIPT_DIR. Skipping link."
fi

# --- 5. Configure Environment ---
ENV_FILE="$HOME/.config/mt/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "🔑 Configuring TMDb credentials..."
    read -rp "Enter your TMDb API Bearer Token: " tmdb_token
    echo "TMDB_TOKEN=\"$tmdb_token\"" > "$ENV_FILE"
    echo "✅ Saved credentials to $ENV_FILE"
else
    echo "✅ TMDb credentials already found."
fi

# --- 6. GUI Setup ---
echo "🌐 Setting up Web Dashboard..."
if [ -d "tracker-gui" ]; then
    cd tracker-gui
    npm install
    echo "✅ Dashboard dependencies installed."
else
    echo "⚠️  Dashboard folder not found in current directory. Skipping npm install."
fi

echo "==========================================="
echo "🎉 Setup Complete! You're ready to track."
echo "==========================================="
echo "Next steps:"
echo "1. Ensure $BIN_DIR is in your PATH."
echo "2. Run 'mt-cli' to start adding media."
echo "3. Run 'npm start' in tracker-gui to launch the dashboard."
