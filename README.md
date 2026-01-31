# 🕷️ SPIDER - Link Auditor

A powerful web crawler tool with a beautiful UI that finds and audits links on any website. Built with Node.js, Puppeteer, and real-time WebSocket updates.

![Spider Link Auditor](https://img.shields.io/badge/version-1.0.0-green) ![Node](https://img.shields.io/badge/node-%3E%3D18-blue) ![License](https://img.shields.io/badge/license-MIT-purple)

## ✨ Features

- **🌐 Universal Crawler** - Works on any website (Webflow, WordPress, React, plain HTML)
- **🎯 Pattern Matching** - Find links containing specific URLs or patterns
- **⚡ Real-time Updates** - Watch the crawl progress live in your browser
- **📊 Export Reports** - Download findings as JSON or CSV
- **📁 Auto-save History** - All crawls are automatically saved for later reference
- **⏸️ Pause/Resume** - Control your crawl at any time
- **🎨 Beautiful UI** - Dark, cyberpunk-inspired interface

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** - Comes with Node.js

### Installation

1. **Navigate to the project folder:**
   ```bash
   cd /Applications/MAMP/htdocs/Spider
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 📖 How to Use

### Basic Usage

1. Enter the **Website URL** (e.g., `https://example.com`)
2. Enter the **Search Pattern** (e.g., `/bad-link` or `spam-site.com`)
3. Set **Max Pages** to crawl (default: 100)
4. Click **Start Crawling**

### Search Pattern Examples

| Pattern | What it finds |
|---------|---------------|
| `/crypto-gambling` | Links containing "/crypto-gambling" in the URL |
| `spam-domain.com` | Links pointing to spam-domain.com |
| `/old-page, /deprecated` | Multiple patterns (comma-separated) |
| `/^https?://evil\.com/` | Regex pattern (wrap in `/`) |

### Controls

- **⏸️ Pause** - Temporarily stop the crawl
- **▶️ Resume** - Continue a paused crawl
- **⏹️ Stop** - End the crawl completely

### Exporting Results

- **JSON** - Structured data for developers
- **CSV** - Spreadsheet-friendly format

## 📁 Project Structure

```
Spider/
├── server.js          # Express + Socket.io server
├── crawler.js         # Puppeteer crawling engine
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Main UI
│   ├── style.css      # Styles
│   └── app.js         # Frontend JavaScript
├── reports/           # Auto-saved crawl reports
└── README.md          # This file
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `PUPPETEER_EXECUTABLE_PATH` | (auto) | Chromium path for deployments |
| `PUPPETEER_SKIP_DOWNLOAD` | `false` | Skip Chromium download when using system Chromium |
| `NODE_OPTIONS` | (empty) | Node memory flags (e.g. `--max-old-space-size=1024`) |

### Railway Deploy

This repo includes `nixpacks.toml` and `railway.json` for Railway builds with Chromium.
Recommended for large crawls: set RAM 4–8 GB and 2–4 vCPU on the Hobby plan.

### Crawler Settings

Edit `crawler.js` to customize:

- **Rate limiting** - Default 300ms between pages
- **Timeout** - Default 30 seconds per page
- **Blocked resources** - Images, fonts, stylesheets (for speed)

## 🔧 Advanced Features

### Multiple Search Patterns

Separate patterns with commas:
```
/bad-link, spam-site.com, /affiliate
```

### Regex Patterns

Wrap in forward slashes:
```
/https?://evil\.com/
```

### Saved Reports

All completed crawls are automatically saved to the `reports/` folder as JSON files. Access them via the **History** button in the UI.

## 🐛 Troubleshooting

### "Puppeteer failed to launch"

Install Chromium dependencies:
```bash
# macOS
brew install chromium

# Ubuntu/Debian
sudo apt-get install -y chromium-browser
```

### "Connection refused" errors

Some sites block automated requests. The crawler uses a realistic user agent, but some firewalls may still block it.

### Slow crawling

- Reduce `maxPages` for faster results
- Some sites load slowly due to JavaScript

## 📝 License

MIT License - Feel free to use and modify!

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Submit a pull request

---

Made with 🕷️ by Spider Link Auditor
