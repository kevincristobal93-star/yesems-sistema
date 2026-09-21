const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const cursoRoutes = require('./routes/curso.routes');
const categoriaRoutes = require('./routes/categoria.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const inscripcionRoutes = require('./routes/inscripcion.routes');
const horarioRoutes = require('./routes/horario.routes');
const pagoRoutes = require('./routes/pago.routes');
const constanciaRoutes = require('./routes/constancia.routes');
const administradorRoutes = require('./routes/administrador.routes');

const app = express();

// Migración idempotente para instalaciones ya existentes.
pool.query('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS comprobante_url varchar(255)')
  .catch((error) => console.error('No se pudo preparar la columna de comprobantes:', error));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'API YES EMS funcionando' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT NOW() AS fecha, current_database() AS base');
    res.json({ ok: true, ...resultado.rows[0] });
  } catch (error) {
    console.error('Error al consultar la base de datos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use('/api/cursos', cursoRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/inscripciones', inscripcionRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/constancias', constanciaRoutes);
app.use('/api/administradores', administradorRoutes);

app.use((error, req, res, next) => {
  if (error instanceof require('multer').MulterError || error.message === 'El comprobante debe ser PDF, JPG o PNG.') {
    return res.status(400).json({ ok: false, mensaje: error.code === 'LIMIT_FILE_SIZE' ? 'El comprobante no puede superar 5 MB.' : error.message });
  }
  next(error);
});

module.exports = app;
