const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT        PRIMARY KEY,
      username    TEXT        UNIQUE NOT NULL,
      email       TEXT        UNIQUE NOT NULL,
      password_hash TEXT      NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id          TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT        NOT NULL,
      price       TEXT,
      image_url   TEXT,
      product_url TEXT        NOT NULL,
      store       TEXT,
      category    TEXT        DEFAULT 'Uncategorized',
      notes       TEXT,
      added_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collections (
      id          TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT        NOT NULL,
      color       TEXT        DEFAULT '#6366f1',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS favorite_collections (
      favorite_id   TEXT NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (favorite_id, collection_id)
    );
  `);
  console.log('Database schema ready.');
}

module.exports = pool;
module.exports.initSchema = initSchema;
