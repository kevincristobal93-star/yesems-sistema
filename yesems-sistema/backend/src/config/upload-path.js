const path = require('path');

// Las pruebas generan documentos en un directorio temporal aislado.
module.exports = process.env.NODE_ENV === 'test' && process.env.TEST_UPLOADS_DIR
  ? path.resolve(process.env.TEST_UPLOADS_DIR)
  : path.resolve(__dirname, '../../uploads');
