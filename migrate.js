// Simple migration runner.
// Runs every .sql file in /migrations, in filename order, against DB_NAME.
// Tracks applied migrations in a `migrations` table so re-running is safe.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const [rows] = await conn.query(
        'SELECT id FROM migrations WHERE filename = ?',
        [file]
      );
      if (rows.length > 0) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`applying: ${file}`);
      // Allow multiple statements per file
      await conn.query(sql);
      await conn.query('INSERT INTO migrations (filename) VALUES (?)', [file]);
    }

    console.log('Migrations complete.');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
