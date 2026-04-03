# 🎬 Media Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

A high-performance, aesthetic personal media tracker designed for Movies, TV Shows, Anime, Manga, and Books. This project bridges a robust Unix-centric CLI toolchain with a modern, glassmorphism-inspired web dashboard to provide a unified, offline-capable library experience.

---

## 🌟 Core Features

### 🏮 Intelligent Anime Sync
- **Dual-Provider Architecture**: Leverages **MyAnimeList (Jikan)** for precise episode guides and **AniList** for high-definition cover art.
- **5-to-10 Score Projection**: MyAnimeList's native 5-point episodic ratings are automatically multiplied by 2 to match a standard 10-point dashboard scale.

### ⭐ Unified Rating Engine
- **Global Scoring**: Harmonizes ratings from TMDb, TVMaze, AniList, and MAL into a single decimal-based 10-point scale.
- **Interactive Filtering**: Dynamic "Any Rating" header selector allows you to instantly filter your library (e.g., only show items rated 8.5+).

### 🖥️ Cinematic Web Dashboard
- **Pure Web Discovery**: Directly search and add media from Jikan, TVMaze, and TMDb without ever opening the terminal.
- **Glassmorphism UI**: High-end React interface built with Framer Motion and responsive layouts.
- **Pixel-Perfect Modals**: Posters are locked to a cinematic 2:3 aspect ratio, ensuring no distortion across detail views.
- **Offline Cache**: Lightning-fast performance by serving metadata from a local JSON-based cache directory.

---

## 🛠 Command Line Interface (CLI)

All core scripts follow the `mt-*` naming convention and are designed to be weightless and fast.

| Command | Function |
| :--- | :--- |
| **`mt-cli`** | The primary interactive terminal hub. |
| **`mt-add`** | Add media (interactive search with fuzzy matching). |
| **`mt-info`** | Metadata synchronizer. Builds the local JSON cache. |
| **`mt-list`** | Clean terminal-based catalog of your library. |
| **`mt-update`** | Instantly update watch/read progress. |
| **`mt-remove`** | Safe deletion of library entries and cache files. |

---

## 🔌 API & Provider Information

| Asset Type | Primary Provider | API Type | Requires Key? |
| :--- | :--- | :--- | :--- |
| **Movies** | [TMDb](https://www.themoviedb.org/) | REST v3/v4 | **Yes** (Free) |
| **TV Shows** | [TVMaze](https://www.tvmaze.com/) | Public REST | No |
| **Anime/Manga** | [Jikan (MAL)](https://jikan.moe/) | Public REST | No |
| **Anime Covers** | [AniList](https://anilist.co/) | GraphQL | No |
| **Books** | [OpenLibrary](https://openlibrary.org/) | Public REST | No |

### 🔑 Token Setup (TMDb)
To enable Movie and TV show Lookups:
1.  Create a free account at [TMDB](https://www.themoviedb.org/).
2.  Navigate to **Settings > API** to generate a "v3 API Key".
3.  Add it to your local environment (see Setup steps below).

---

## 🚀 Installation & Setup

### Path A: One-Command Automated Setup (Recommended)
Our automated script detects your OS, installs required CLI tools, and initializes the environment.
```bash
git clone https://github.com/Aaravshah2907/Media-Tracker.git
cd Media-Tracker
./scripts/setup.sh
```

### Path B: Detailed Manual Installation
If you prefer precise control, follow these steps:

#### 1. Prerequisites
- **Unix Shell**: Bash/Zsh recommended.
- **CLI Tools**: Install `jq`, `fzf`, `curl`, and `node` (`brew install jq fzf curl node`).

#### 2. Initialize Directories
```bash
mkdir -p ~/.config/mt
mkdir -p ~/Documents/Personal/Tracker/cache/{movie,tv,anime,manga,book}
```

#### 3. Configure Environment
Create a file at `~/.config/mt/.env` and add your TMDb token:
```bash
TMDB_TOKEN="your_v3_api_key_here"
```

#### 4. Sync CLI Binaries
```bash
cp .local/bin/mt-* ~/.local/bin/
cp .local/bin/providers/*.sh ~/.local/bin/providers/
chmod +x ~/.local/bin/mt-* ~/.local/bin/providers/*.sh
```

#### 5. Build and Launch the Dashboard
For the fastest, "Studio-Grade" experience, it is highly recommended to compile the app into production mode:
```bash
cd tracker-gui
npm install
npm run build
node server.js
```
The dashboard will be served instantly at `http://localhost:3001`.

#### 🚀 Pro-Tip: The Terminal Alias
Make launching your tracker instant by adding a shortcut to your `.zshrc` or `.bashrc`:
```bash
echo 'alias tracker="cd ~/Documents/Personal/Tracker/tracker-gui && node server.js"' >> ~/.zshrc && source ~/.zshrc
```
Now, just type `tracker` in your terminal anytime to launch your library!

---

## 🍱 Project Architecture

This is a **database-less** system designed for speed and portability.
1.  **`library.json`**: The single source of truth for your media collection.
2.  **`cache/`**: A directory structure housing full REST responses from providers, ensuring you never hit API rate limits twice for the same data.
3.  **Shell Sync**: The `mt-info` script intelligently identifies missing cache files and performs rate-limited fetches to build your local catalogs.

---

## 🤝 Contributing
Contributions are welcome! Please follow these steps:
1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 🛣️ Future Functionalities (Help Required!)

This project is constantly evolving, and we are looking for open-source contributors to help build the next phase of the Media Tracker! Here are the major features on our roadmap to make this a fully self-sufficient ecosystem:

1. **Torrent Downloader Integration**: A built-in system to search and trigger torrent downloads directly from the web dashboard for planned media.
2. **Auto-Locate Local Files**: A background daemon or script that automatically scans local directories for episodes and movies, attaching the correct local path to `library.json` so the "One-Click Play" feature works seamlessly.
3. **Analytics & Statistics**: Translating your local JSON tracking history into visual data (e.g., total hours watched, genre breakdowns, and rating deviations).
4. **Calendar & Notifications**: A visual calendar view plotting out exact air dates for tracking ongoing anime and TV shows without leaving the app.
5. **Automated Metadata Refresh**: Implementing a lightweight Cron-Job that runs `mt-info` daily in the background to automatically update ongoing episode counts.
6. **Cloud Export Engine**: A simple hook to backup your `library.json` or export your list back to official services (MAL, AniList, Trakt) to prevent data loss.
7. **Custom Categorization & Filtering**: Implementing advanced filtering based on:
    - **Production Media**: Filter your library by platform/studio (e.g., Paramount+, Netflix, Amazon Prime Video, Disney+).
    - **User Tags & Collections**: Create custom groupings for franchises and universes like **MCU**, **Harry Potter (HP)**, **DCEU**, or **Star Wars**.
8. **VLC Real-Time Sync**: Implementing a background bridge to communicate with VLC's media states, automatically incrementing your progress in `library.json` once an episode is fully viewed.
9. **Dynamic Theme Engine**: Implementing adaptive UI colors that shift based on the dominant palette of the media poster currently in view (utilizing `colorthief`).
10. **Cinematic Trailer Hub**: A built-in YouTube API integration to watch trailers directly within the media detail modals.
11. **"What's Next?" Recommendations**: Localized intelligence to suggest media from your "Planned" list based on your genre preferences and high-rated items.
12. **Global Command Palette (CMD+K)**: A high-performance search overlay to navigate the library, search for new media, or trigger CLI commands from any screen.
13. **Media-Proxy Browser Extension**: A browser-level integration to "Add to Tracker" directly while browsing Netflix, Disney+, or MyAnimeList.
14. **Automated E-Book Syncing**: Expanding progress tracking to e-readers (Calibre/Kindle) to automatically update page counts in `library.json`.

If you are interested in building these out, please open an Issue or check the Contributing section!

---

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.
