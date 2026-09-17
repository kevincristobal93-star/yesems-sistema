const app = require('./src/app');
require('dotenv').config();
const { runServiceAvailabilityMigration } = require('./src/config/run-migrations');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await runServiceAvailabilityMigration();
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No fue posible preparar la disponibilidad de servicios:', error);
    process.exit(1);
  }
}

startServer();
