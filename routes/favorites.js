const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { requireAuth } = require('./auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/favorites — list all favorites, with optional filters
router.get('/', (req, res) => {
  const { search, store, category, sort = 'newest' } = req.query;

  let query = 'SELECT * FROM favorites WHERE user_id = ?';
  const params = [req.userId];

  if (search) {
    query += ' AND (title LIKE ? OR store LIKE ? OR notes LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (store) {
    query += ' AND store = ?';
    params.push(store);
  }
  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  const orderMap = {
    newest: 'added_at DESC',
    oldest: 'added_at ASC',
    name_asc: 'title ASC',
    name_desc: 'title DESC',
    price_asc: 'CAST(REPLACE(REPLACE(price, "$", ""), ",", "") AS REAL) ASC',
    price_desc: 'CAST(REPLACE(REPLACE(price, "$", ""), ",", "") AS REAL) DESC',
  };
  query += ` ORDER BY ${orderMap[sort] || orderMap.newest}`;

  try {
    const favorites = db.prepare(query).all(...params);
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites.' });
  }
});

// GET /api/favorites/stats — summary stats for the dashboard
router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(req.userId).count;
    const stores = db.prepare('SELECT COUNT(DISTINCT store) as count FROM favorites WHERE user_id = ?').get(req.userId).count;
    const categories = db.prepare('SELECT category, COUNT(*) as count FROM favorites WHERE user_id = ? GROUP BY category ORDER BY count DESC').all(req.userId);
    const storeList = db.prepare('SELECT DISTINCT store FROM favorites WHERE user_id = ? AND store IS NOT NULL ORDER BY store').all(req.userId).map(r => r.store);
    res.json({ total, stores, categories, storeList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// GET /api/favorites/:id — single favorite
router.get('/:id', (req, res) => {
  const fav = db.prepare('SELECT * FROM favorites WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!fav) return res.status(404).json({ error: 'Favorite not found.' });
  res.json(fav);
});

// POST /api/favorites — add a new favorite (used by the extension)
router.post('/', (req, res) => {
  const { title, price, image_url, product_url, store, category, notes } = req.body;

  if (!title || !product_url) {
    return res.status(400).json({ error: 'Title and product URL are required.' });
  }

  // Prevent duplicates for the same user + URL
  const duplicate = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND product_url = ?').get(req.userId, product_url);
  if (duplicate) {
    return res.status(409).json({ error: 'This item is already in your favorites.', id: duplicate.id });
  }

  try {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO favorites (id, user_id, title, price, image_url, product_url, store, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.userId, title, price || null, image_url || null, product_url, store || extractStore(product_url), category || 'Uncategorized', notes || null);

    const fav = db.prepare('SELECT * FROM favorites WHERE id = ?').get(id);
    res.status(201).json(fav);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save favorite.' });
  }
});

// PUT /api/favorites/:id — update a favorite (notes, category, etc.)
router.put('/:id', (req, res) => {
  const fav = db.prepare('SELECT * FROM favorites WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!fav) return res.status(404).json({ error: 'Favorite not found.' });

  const { title, price, image_url, notes, category } = req.body;

  try {
    db.prepare(`
      UPDATE favorites SET
        title = COALESCE(?, title),
        price = COALESCE(?, price),
        image_url = COALESCE(?, image_url),
        notes = ?,
        category = COALESCE(?, category)
      WHERE id = ? AND user_id = ?
    `).run(title || null, price || null, image_url || null, notes !== undefined ? notes : fav.notes, category || null, req.params.id, req.userId);

    const updated = db.prepare('SELECT * FROM favorites WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorite.' });
  }
});

// DELETE /api/favorites/:id — remove a favorite
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Favorite not found.' });
  res.json({ success: true });
});

// DELETE /api/favorites — bulk delete
router.delete('/', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Provide an array of IDs to delete.' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM favorites WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.userId);
  res.json({ success: true });
});

function extractStore(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1) : hostname;
  } catch {
    return 'Unknown';
  }
}

module.exports = router;
