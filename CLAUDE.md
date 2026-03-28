# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm start         # Start server (node server.js, port 3000)
npm run dev       # Dev with hot-reload (nodemon server.js)
```

No build step, test suite, or linter is configured. This is a vanilla JS + Node project.

## Architecture Overview

FavoritesHub is a shopping wishlist app with three interconnected components:

### Backend (`server.js`, `database.js`, `routes/`)
- Express REST API on port 3000
- PostgreSQL via Supabase (connection string in `.env`)
- `initSchema()` in `database.js` creates tables on startup if they don't exist
- JWT auth (30-day tokens, Bearer header) via `requireAuth` middleware in `routes/auth.js`
- Tables: `users`, `favorites`, `collections`, `favorite_collections`
- Duplicate favorites are prevented by unique constraint on `product_url` per user

### Web App (`public/`)
- Vanilla JS SPA — no framework, no bundler
- Auth on `/` (`index.html`), dashboard on `/dashboard` (`dashboard.html`)
- Token + user stored in `localStorage` (`fh_token`, `fh_user`)
- PWA with Service Worker (`sw.js`) using network-first cache strategy
- Web Share Target API enabled — mobile devices can share URLs directly to the app via `/share`

### Chrome Extension (`extension/`)
- Manifest V3, background service worker proxies all API calls to avoid CORS
- `content.js` runs on all URLs (except blocked hosts like social media, YouTube, etc.)
- Detection strategy (in priority order):
  1. Site-specific CSS selectors for 14+ known stores (Amazon, Nike, Target, etc.)
  2. Generic pattern matching on button aria-labels/classes containing "wish", "fav", "save", "heart"
  3. MutationObserver watching for aria-label/aria-pressed/class changes
- Login-wall detection: 300ms after click, checks for visible auth-related modals before proceeding
- `popup/popup.js` handles quick-save (extracts OG image + price from `<meta>` / JSON-LD / site-specific selectors)
- `background.js` receives messages from content/popup and POSTs to `/api/favorites`

### Data Flow
```
Extension content.js (detects click)
  → extracts product title/price/image/store
  → shows confirmation dialog
  → sends to background.js via chrome.runtime.sendMessage
  → background.js POSTs to /api/favorites with JWT
  → dashboard.js reflects new item on next load
```

## Key Implementation Details

- **Price extraction**: Uses site-specific CSS selectors first, then falls back to generic `[class*="price"]` patterns and `scripting.executeScript` for reliable DOM access from the extension
- **Image extraction**: Prefers OG meta tags (`og:image`) over page screenshots or favicons; falls back to JSON-LD `image` field
- **Price sorting in SQL**: Uses `CAST(REGEXP_REPLACE(price, '[^0-9.]', '', 'g') AS NUMERIC)` to sort prices stored as strings
- **Extension vs. web app auth**: Extension uses an API token (separate from JWT session) stored in `chrome.storage.local`; the web app uses a JWT stored in `localStorage`
- **Collections**: Schema exists (`collections`, `favorite_collections` tables) but is not yet exposed via API or UI
