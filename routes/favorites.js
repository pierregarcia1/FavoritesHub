const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../database');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/favorites ────────────────────────────────────────
router.get('/', async (req, res) => {
  const { search, store, category, sort = 'newest' } = req.query;

  const orderMap = {
    newest:     'added_at DESC',
    oldest:     'added_at ASC',
    name_asc:   'title ASC',
    name_desc:  'title DESC',
    price_asc:  "CAST(REGEXP_REPLACE(COALESCE(price, '0'), '[^0-9.]', '', 'g') AS NUMERIC) ASC NULLS LAST",
    price_desc: "CAST(REGEXP_REPLACE(COALESCE(price, '0'), '[^0-9.]', '', 'g') AS NUMERIC) DESC NULLS LAST",
  };
  const orderBy = orderMap[sort] || orderMap.newest;

  const conditions = ['user_id = $1'];
  const params = [req.userId];
  let i = 2;

  if (search) {
    conditions.push(`(title ILIKE $${i} OR store ILIKE $${i} OR notes ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }
  if (store) {
    conditions.push(`store = $${i}`);
    params.push(store);
    i++;
  }
  if (category && category !== 'All') {
    conditions.push(`category = $${i}`);
    params.push(category);
    i++;
  }

  try {
    const result = await pool.query(
      `SELECT * FROM favorites WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /favorites error:', err.message);
    res.status(500).json({ error: 'Failed to fetch favorites.' });
  }
});

// ── GET /api/favorites/stats ───────────────────────────────────
// NOTE: must stay above /:id so Express matches it as an exact route first
router.get('/stats', async (req, res) => {
  try {
    const [total, stores, categories, storeList] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM favorites WHERE user_id = $1', [req.userId]),
      pool.query('SELECT COUNT(DISTINCT store) AS count FROM favorites WHERE user_id = $1', [req.userId]),
      pool.query(
        'SELECT category, COUNT(*) AS count FROM favorites WHERE user_id = $1 GROUP BY category ORDER BY count DESC',
        [req.userId]
      ),
      pool.query(
        'SELECT DISTINCT store FROM favorites WHERE user_id = $1 AND store IS NOT NULL ORDER BY store',
        [req.userId]
      ),
    ]);

    res.json({
      total:     parseInt(total.rows[0].count),
      stores:    parseInt(stores.rows[0].count),
      categories: categories.rows,
      storeList:  storeList.rows.map((r) => r.store),
    });
  } catch (err) {
    console.error('GET /favorites/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ── GET /api/favorites/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM favorites WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Favorite not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/favorites ────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, price, image_url, product_url, store, category, notes } = req.body;

  if (!title || !product_url) {
    return res.status(400).json({ error: 'Title and product URL are required.' });
  }

  try {
    const duplicate = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND product_url = $2',
      [req.userId, product_url]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        error: 'This item is already in your favorites.',
        id: duplicate.rows[0].id,
      });
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO favorites (id, user_id, title, price, image_url, product_url, store, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        req.userId,
        title,
        price || null,
        image_url || null,
        product_url,
        store || extractStore(product_url),
        category || 'Uncategorized',
        notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /favorites error:', err.message);
    res.status(500).json({ error: 'Failed to save favorite.' });
  }
});

// ── PUT /api/favorites/:id ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { title, price, image_url, notes, category } = req.body;

  // Build the SET clause dynamically so omitted fields are never touched.
  // Using a static query with COALESCE would wipe notes when not provided.
  const fields = [];
  const params = [];
  let i = 1;

  if (title !== undefined)     { fields.push(`title = $${i++}`);     params.push(title || null); }
  if (price !== undefined)     { fields.push(`price = $${i++}`);     params.push(price || null); }
  if (image_url !== undefined) { fields.push(`image_url = $${i++}`); params.push(image_url || null); }
  if (notes !== undefined)     { fields.push(`notes = $${i++}`);     params.push(notes || null); }
  if (category !== undefined)  { fields.push(`category = $${i++}`);  params.push(category || null); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  params.push(req.params.id, req.userId);

  try {
    const result = await pool.query(
      `UPDATE favorites SET ${fields.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Favorite not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /favorites error:', err.message);
    res.status(500).json({ error: 'Failed to update favorite.' });
  }
});

// ── DELETE /api/favorites/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM favorites WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Favorite not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── DELETE /api/favorites (bulk) ───────────────────────────────
router.delete('/', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Provide an array of IDs to delete.' });
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(
      `DELETE FROM favorites WHERE id IN (${placeholders}) AND user_id = $${ids.length + 1}`,
      [...ids, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

function extractStore(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const parts = hostname.split('.');
    const name = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown';
  }
}

module.exports = router;
