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

module.exports = app;