# FavoritesHub

A centralized favorites list for saving shopping items from across the web. Works hand-in-hand with a browser extension.

## Features

- **User accounts** — register, log in, stay signed in for 30 days
- **Save items** — manually or via the browser extension
- **Rich item cards** — image, price, store, category, notes
- **Filter & search** — by category, store, or free-text search
- **Sort** — newest, oldest, name, or price
- **Grid & list views**
- **Bulk delete** — select multiple items and remove them at once
- **Extension API** — a REST API with JWT auth so the extension can add items silently

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
# or for hot-reload during development:
npm run dev
```

### 3. Open the app

Visit [http://localhost:3000](http://localhost:3000), create an account, and start saving!

---

## Browser Extension Integration

The extension communicates with this server using a **JWT Bearer token**. 

### Getting the token

After logging in, click your username → **API Token** to copy your token.  
Paste it into the extension settings.

---

### Extension API Reference

**Base URL:** `http://localhost:3000` (or your deployed URL)

---

#### `POST /api/favorites`

Add a new favorite. Called by the extension when the user clicks the "like" button on a product.

**Headers**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request body**
```json
{
  "title":       "Sony WH-1000XM5 Headphones",   // required
  "product_url": "https://amazon.com/dp/...",      // required
  "price":       "$279.99",                        // optional
  "image_url":   "https://m.media-amazon.com/...", // optional
  "store":       "Amazon",                         // optional (auto-detected from URL if omitted)
  "category":    "Electronics",                    // optional (default: "Uncategorized")
  "notes":       "Birthday gift idea"              // optional
}
```

**Success response** `201 Created`
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Sony WH-1000XM5 Headphones",
  "price": "$279.99",
  "image_url": "...",
  "product_url": "...",
  "store": "Amazon",
  "category": "Electronics",
  "notes": null,
  "added_at": "2026-03-12T00:00:00.000Z"
}
```

**Already saved** `409 Conflict`
```json
{ "error": "This item is already in your favorites.", "id": "existing-uuid" }
```

---

#### `GET /api/health`

Lets the extension verify connectivity.

**Response** `200 OK`
```json
{ "status": "ok", "version": "1.0.0" }
```

---

#### `GET /api/favorites`

Get all favorites for the authenticated user.

Optional query params:
| Param | Values |
|-------|--------|
| `search` | free text |
| `store` | store name |
| `category` | category name |
| `sort` | `newest` \| `oldest` \| `name_asc` \| `name_desc` \| `price_asc` \| `price_desc` |

---

#### `DELETE /api/favorites/:id`

Remove a single favorite by its ID.

---

#### `PUT /api/favorites/:id`

Update a favorite (title, price, image_url, notes, category).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on |
| `JWT_SECRET` | `favorites-hub-secret-key-...` | **Change this in production!** |

---

## Project Structure

```
FavoritesHub/
├── server.js          — Express entry point
├── database.js        — SQLite setup & schema
├── routes/
│   ├── auth.js        — /api/auth (register, login, me)
│   └── favorites.js   — /api/favorites (CRUD)
└── public/
    ├── index.html     — Landing / auth page
    ├── dashboard.html — Main favorites dashboard
    ├── css/styles.css — All styles
    └── js/
        ├── auth.js        — Login / register logic
        └── dashboard.js   — Dashboard logic
```
