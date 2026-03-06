# 📥 Telegram File Downloader

**Client-side Telegram file downloader using MTProto protocol.** No file size limits. No server processing. Everything runs in your browser.

Built with [GramJS](https://gram.js.org) (Telethon for JavaScript) and deployed as a static site on [Cloudflare Pages](https://pages.cloudflare.com).

## ✨ How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    YOUR BROWSER                          │
│                                                          │
│  ┌────────────┐    WebSocket (MTProto)    ┌───────────┐  │
│  │  GramJS     │◄─────────────────────────►│ Telegram  │  │
│  │  Client     │                           │ Servers   │  │
│  └────────────┘                           └───────────┘  │
│       │                                                   │
│       ▼                                                   │
│  File saved directly to your device                       │
│  Session stored in localStorage                           │
└──────────────────────────────────────────────────────────┘
         │
         │  Static files only (HTML/JS/CSS)
         ▼
┌──────────────────┐
│ Cloudflare Pages │  ← No Workers needed, just static hosting
└──────────────────┘
```

### Why This Approach?

| Approach | File Size Limit | Server Needed | Persistent Connection |
|----------|----------------|---------------|----------------------|
| Bot API (HTTP) | 20 MB | Yes | No |
| Pyrogram/Telethon on Workers | Workers timeout (30s) | Yes | Impossible |
| **GramJS in Browser** | **Unlimited** ✅ | **No** ✅ | **Yes (WebSocket)** ✅ |

- **Telegram Bot API** limits downloads to 20MB and needs a server
- **Cloudflare Workers** have execution time limits (30s free / 60s paid) — too short for large files
- **This app** uses MTProto directly from the browser via WebSocket — no size limits, no timeouts, no server costs

## 🚀 Quick Start

### Prerequisites

You need two things:

1. **Telegram API Credentials** — Get from [my.telegram.org](https://my.telegram.org):
   - Go to "API development tools"
   - Create an app → note your **API ID** and **API Hash**

2. **Bot Token** — Get from [@BotFather](https://t.me/BotFather):
   - Create a bot or use existing one
   - The bot must be a **member** of any private channel you want to download from

### Run Locally

```bash
# Clone the repo
git clone https://github.com/CloudflareHackers/TGCFWorkersDLBot.git
cd TGCFWorkersDLBot

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:3000 and:
1. Enter your **API ID**, **API Hash**, and **Bot Token**
2. Click **Connect** — the bot authenticates via MTProto WebSocket
3. Paste a Telegram message link (e.g., `https://t.me/c/2113604672/730`)
4. Click **Download** — file downloads directly to your device

### Deploy to Cloudflare Pages

**Option 1: CLI**
```bash
npm run build
npx wrangler pages deploy dist --project-name tgcf-dl
```

**Option 2: Git Integration (Recommended)**
1. Push to GitHub/GitLab
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create Project
3. Connect your repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Deploy!

## 📁 Supported Link Formats

| Format | Example |
|--------|---------|
| Private channel | `https://t.me/c/2113604672/730` |
| Public channel | `https://t.me/channelname/123` |
| tg:// protocol | `tg://privatepost?channel=2113604672&msg_id=730` |

## 🏗️ Architecture

```
TGCFWorkersDLBot/
├── index.html              # Entry point
├── src/
│   ├── main.js             # UI logic, event handling, app bootstrap
│   ├── telegram-client.js  # GramJS wrapper: connect, fetch, download
│   ├── link-parser.js      # Telegram URL parser & utilities
│   └── style.css           # Dark theme UI styles
├── vite.config.js          # Vite bundler config with Buffer polyfill
├── wrangler.toml           # Cloudflare Pages config
└── package.json
```

### Key Design Decisions

- **GramJS** (`telegram` npm package) is Telethon ported to JavaScript. It speaks MTProto natively and works in browsers via WebSocket.
- **Buffer polyfill** is required because GramJS uses Node.js `Buffer` internally.
- **Session persistence** uses `localStorage` — reconnecting is instant after first login.
- **No backend** — Cloudflare Pages serves static files only. All crypto, MTProto, and file handling happen in the browser.

## 🔒 Security

- **Credentials stay local** — API ID, Hash, and Bot Token are stored only in your browser's `localStorage`. They are never sent to any server except Telegram's MTProto servers.
- **Session string** — The MTProto session is saved locally for fast reconnect. Clear it anytime with the 🗑️ button.
- **Open source** — Audit the code yourself. No tracking, no analytics, no third-party scripts.

## ⚠️ Important Notes

1. **Bot must have access** — For private channels, the bot must be an admin/member of the channel.
2. **Large files = RAM** — Files are buffered in browser memory before saving. Very large files (>2GB) may hit browser memory limits.
3. **API credentials** — Never share your API ID/Hash. They're tied to your Telegram account.

## 🛠️ Development

```bash
# Dev server with hot reload
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview
```

## 📜 License

MIT
