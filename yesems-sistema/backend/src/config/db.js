const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432,
    };

const pool = new Pool({
  ...poolConfig,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('Conectado a PostgreSQL.');
});

pool.on('error', (err) => {
  // Neon puede cerrar conexiones inactivas. pg retira el cliente afectado;
  // las siguientes solicitudes pueden abrir una conexión nueva.
  // No registrar el objeto original: puede contener datos de conexión.
  const code = /^[A-Z0-9_]{2,32}$/.test(err?.code || '') ? err.code : 'UNKNOWN';
  console.error('Conexión inactiva de PostgreSQL interrumpida:', code);
});

module.exports = pool;
