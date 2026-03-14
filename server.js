require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes      = require('./routes/auth');
const favoritesRoutes = require('./routes/favorites');
const { initSchema }  = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/favorites', favoritesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialise schema first, then open the port.
// This guarantees tables exist before any request can be served.
(async () => {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`FavoritesHub running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialise database schema:', err.message);
    process.exit(1);
  }
})();
