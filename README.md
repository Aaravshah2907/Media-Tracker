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
- **Pure Web Discovery**: Directly search and add media from Jikan, TVMaze, Google Books, and TMDb without ever opening the terminal.
- **Glassmorphism UI**: High-end React interface built with Framer Motion and responsive layouts.
- **Pixel-Perfect Modals**: Posters are locked to a cinematic 2:3 aspect ratio, ensuring no distortion across detail views.
- **Sidecar Architecture**: Lightning-fast performance by separating a minimal `library.json` index from high-fidelity metadata sidecars in `/media/`.
- **Specialized Metadata**: Deep-stats for every type: Budget/Revenue for Movies, Networks for TV, Studios for Anime, and Publishers/Authors for Books.
- **Advanced Library Filtering**: Dynamically browse your collection by **Production Company**, **Network**, or **Publisher** (e.g., HBO, MAPPA, Disney) using the new Studio filter.
- **Absolute Episode Sync**: Precise progress tracking for TV/Anime series. Marking an episode as watched automatically advances the library's absolute progress (e.g., HIMYM 208/208).
- **Precision Episode Tracking**: Individually link episodes to local file paths and mark checkmarks per-episode with sidecar persistence.
- **Stable Playlists**: Automatically generates and manages persistent `.m3u8` playlists for series, using a predictable `source-id` naming scheme that auto-overwrites on each play to prevent folder clutter.

### 🔄 Intelligent Synchronization
- **VLC (Live Sync)**: Real-time minute tracking for Movies. The toggle syncs your current playback timestamp directly to the tracker (e.g. `45m / 148m`).
- **Apple Books (Persistent Sync)**: Direct SQLite database integration. Automatically pulls your reading percentage (High-Watermark) even if the app was closed hours ago.
- **Smart Open**: One-click playback logic that chooses the best app for your media: VLC for video, Preview for PDFs, Apple Books for EPUBs, and Simple Comic for CBR/CBZ.

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

This is a **database-less, split-file system** designed for extreme portability and scale.

1.  **`library.json` (The Minimal Index)**: A lightweight index containing only the essential metadata needed to render the dashboard (titles, status, progress, ratings). This ensures the app loads in milliseconds regardless of library size.
2.  **`media/` (The Specialized Sidecars)**: Individual JSON files for every item in your library. These store the high-depth metadata (overview, specialized details, cast/crew) and your personal local file paths.
3.  **`cache/`**: A structure housing raw, unedited REST responses from providers. This acts as a "Source of Truth" to rebuild or refresh your sidecars without re-hitting API rate limits.
4.  **The Shell Bridge**: The `mt-info` script identifies missing entries and performs automated, rate-limited fetches to build your local environment.

---

## 🤝 Contributing
Contributions are welcome! Please follow these steps:
1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 🛣️ Future Functionalities (Help Required!)

This project is constantly evolving. Here are the major features on our roadmap:

1. **Torrent Downloader Integration**: A built-in system to search and trigger torrent downloads directly from the web dashboard.
2. **Auto-Locate Local Files**: A background daemon that scans local directories and auto-links them to your library items.
3. **Analytics & Statistics**: Transforming your JSON history into visual genre breakdowns and watch-time data.
4. **Calendar View**: A visual air-date grid for tracking ongoing Anime and TV seasons.
5. **MyAnimeList/AniList Export**: A simple hook to sync your local list back to cloud services to prevent data loss.
6. **Dynamic Theme Engine**: UI colors that shift based on the dominant palette of the media poster in view.
7. **Global Command Palette (CMD+K)**: A high-performance search overlay to navigate and trigger commands from any screen.
8. **Cast**: Add cast details.

If you are interested in building these out, please open an Issue or check the Contributing section!

---

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.
