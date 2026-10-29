const app = require('./src/app');
require('dotenv').config();
const { runStartupMigrations } = require('./src/config/run-migrations');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await runStartupMigrations();
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    const code = /^[A-Z0-9_]{2,32}$/.test(error?.code || '') ? error.code : 'UNKNOWN';
    console.error('No fue posible preparar la base de datos. Revisa la conexión y las migraciones. Código:', code);
    process.exit(1);
  }
}

startServer();
