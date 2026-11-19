const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  insertIdAsNumber: true,
  bigIntAsNumber: true
});

// Attend que MariaDB soit prêt au démarrage du conteneur
async function waitForDb(retries = 10, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      console.log('Connexion à MariaDB établie.');
      return;
    } catch (err) {
      console.log(`Attente de MariaDB (${i}/${retries})...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw new Error('Impossible de se connecter à MariaDB.');
}

module.exports = { pool, waitForDb };