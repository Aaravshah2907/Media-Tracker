# 🎬 Media Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

A powerful, aesthetic personal media tracker for Movies, TV Shows, Anime, Manga, and Books. This project combines a robust suite of CLI tools with a modern, glassmorphism-inspired web interface.

---

## 🚀 Quick Start (GitHub Clone)

If you are setting this up for the first time after cloning the repository, follow these exact steps:

### 1. Initialize the Directory
The scripts expect a standard directory in your Documents folder.

```bash
# Create the root tracker folder
mkdir -p ~/Documents/Personal/Tracker

# Go to your clone directory and copy all project files
# Replace /path/to/cloned/repo with your actual clone path
cp -r /path/to/cloned/repo/* ~/Documents/Personal/Tracker/
cd ~/Documents/Personal/Tracker
```

### 2. Configure Environment Variables
The CLI tools require a TMDb API Access Token (Bearer Token).

```bash
# Create the config directory
mkdir -p ~/.config/mt

# Create and open the .env file
cat <<EOF > ~/.config/mt/.env
TMDB_TOKEN="your_long_bearer_token_here"
EOF
```

### 3. Install CLI Tools
Move the provided scripts into your system's local bin and make them executable.

```bash
# Ensure local bin exists
mkdir -p ~/.local/bin

# Copy scripts
cp -r .local/bin/* ~/.local/bin/

# Make scripts executable
chmod +x ~/.local/bin/mt-*

# Optional: Add to PATH if not already there (for ZSH)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Setup the Web Dashboard
Install Node dependencies and start the application.

```bash
cd tracker-gui
npm install
npm run dev
```

---

## 🛠 Project Architecture

| Component | Responsibility |
| :--- | :--- |
| **CLI Core** | Data fetching (TMDb, AniList, TVMaze, OpenLibrary), library management, and VLC integration. |
| **Web GUI** | Visual dashboard, real-time search, metadata editing, and automated sync triggers. |

---

## 📖 Features

-   **Multi-Platform Support**: Track Movies, TV Shows, Anime (AniList), Manga (AniList), and Books (OpenLibrary).
-   **Aesthetic UI**: Glassmorphism dashboard with dynamic posters and progress tracking.
-   **Local Playback**: One-click play via **VLC** for media available on your machine.
-   **Automated Sync**: Keep your metadata fresh with high-performance background sync scripts.
-   **Interactive Metadata**: Premium dropdowns for status management (Watched, Planned, Caught Up, etc.).

---

## 🤝 Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) to get started and check out our [Templates](.github/ISSUE_TEMPLATE) for reporting issues.

## ⚖️ License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## ❤️ Credits & Acknowledgements

-   **TMDb API**: For providing movie and TV metadata.
-   **AniList API**: For powering the anime and manga support.
-   **TVMaze API**: For detailed TV show episode guides.
-   **OpenLibrary API**: For book data and covers.
