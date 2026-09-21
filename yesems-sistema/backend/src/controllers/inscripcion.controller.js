const inscripcionModel = require('../models/inscripcion.model');
const pool = require('../config/db');

// POST /api/inscripciones/mia
// Completa el perfil del cliente y crea su inscripción en una sola transacción.
const crearInscripcionPropia = async (req, res) => {
	const client = await pool.connect();
	try {
		const { id_curso, id_horario, telefono, fecha_nacimiento, curp } = req.body;
		const idUsuario = req.admin.id_usuario;

		if (!id_curso || !telefono || !fecha_nacimiento || !curp) {
			return res.status(400).json({ ok: false, mensaje: 'id_curso, telefono, fecha_nacimiento y curp son obligatorios' });
		}

		await client.query('BEGIN');
		const cursoResult = await client.query(
			'SELECT id_curso, precio FROM cursos WHERE id_curso = $1 AND activo = true',
			[id_curso]
		);
		if (!cursoResult.rows[0]) {
			await client.query('ROLLBACK');
			return res.status(404).json({ ok: false, mensaje: 'El curso seleccionado no está disponible' });
		}

		if (id_horario) {
			const disponibilidad = await client.query(
				'SELECT id_horario FROM horarios WHERE id_horario = $1 AND id_curso = $2',
				[id_horario, id_curso]
			);
			if (!disponibilidad.rows[0]) {
				await client.query('ROLLBACK');
				return res.status(400).json({ ok: false, mensaje: 'La disponibilidad seleccionada no pertenece a este curso' });
			}
		}

		const existente = await client.query(
			`SELECT id_inscripcion FROM inscripciones
			 WHERE id_usuario = $1 AND id_curso = $2 AND estado <> 'cancelada'`,
			[idUsuario, id_curso]
		);
		if (existente.rows[0]) {
			await client.query('ROLLBACK');
			return res.json({ ok: true, existente: true, mensaje: 'Ya cuentas con una inscripción activa para este curso.', inscripcion: existente.rows[0] });
		}

		const usuarioResult = await client.query(
			`UPDATE usuarios
			 SET telefono = $1,
			     fecha_nacimiento = $2,
			     curp = $3,
			     folio = COALESCE(folio, 'YESEMS-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(id_usuario::text, 5, '0')),
			     rol = 'alumno'
			 WHERE id_usuario = $4
			 RETURNING id_usuario, nombre, apellido, email, folio, rol`,
			[telefono, fecha_nacimiento, curp.toUpperCase(), idUsuario]
		);

		const inscripcionResult = await client.query(
			`INSERT INTO inscripciones (id_usuario, id_curso, id_horario, monto_total)
			 VALUES ($1, $2, $3, $4) RETURNING *`,
			[idUsuario, id_curso, id_horario || null, cursoResult.rows[0].precio ?? 0]
		);
		await client.query('COMMIT');
		res.status(201).json({ ok: true, usuario: usuarioResult.rows[0], inscripcion: inscripcionResult.rows[0] });
	} catch (error) {
		await client.query('ROLLBACK');
		console.error('Error al crear inscripción propia:', error);
		if (error.code === '23505') {
			return res.status(409).json({ ok: false, mensaje: 'La CURP ya está registrada en otra cuenta' });
		}
		res.status(500).json({ ok: false, error: error.message });
	} finally {
		client.release();
	}
};

// GET /api/inscripciones/mias
// Resumen seguro del alumno autenticado para su panel personal.
const listarInscripcionesPropias = async (req, res) => {
	try {
		const resultado = await pool.query(
			`SELECT i.id_inscripcion, i.fecha_inscripcion, i.estado, i.monto_total,
			        c.nombre AS curso_nombre, c.descripcion AS curso_descripcion,
			        h.id_horario, h.modalidad AS disponibilidad_modalidad, h.dia_semana AS disponibilidad_dia,
			        h.hora_inicio AS disponibilidad_hora_inicio, h.hora_fin AS disponibilidad_hora_fin,
			        h.fecha_inicio AS disponibilidad_fecha_inicio, h.fecha_fin AS disponibilidad_fecha_fin,
			        h.informacion_adicional AS disponibilidad_informacion, h.notas AS disponibilidad_notas,
			        COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'completado'), 0) AS total_pagado,
			        BOOL_OR(p.estado = 'pendiente') AS tiene_pago_pendiente,
			        co.id_constancia, co.estado AS estado_constancia, co.folio AS folio_constancia
			 FROM inscripciones i
			 JOIN cursos c ON c.id_curso = i.id_curso
			 LEFT JOIN horarios h ON h.id_horario = i.id_horario
			 LEFT JOIN pagos p ON p.id_inscripcion = i.id_inscripcion
			 LEFT JOIN constancias co ON co.id_inscripcion = i.id_inscripcion
			 WHERE i.id_usuario = $1
			 GROUP BY i.id_inscripcion, c.nombre, c.descripcion, h.id_horario, h.modalidad, h.dia_semana,
			          h.hora_inicio, h.hora_fin, h.fecha_inicio, h.fecha_fin, h.informacion_adicional, h.notas,
			          co.id_constancia, co.estado, co.folio
			 ORDER BY i.fecha_inscripcion DESC`,
			[req.admin.id_usuario]
		);
		res.json({ ok: true, inscripciones: resultado.rows });
	} catch (error) {
		console.error('Error al listar inscripciones propias:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const listarInscripciones = async (req, res) => {
	try {
		const inscripciones = await inscripcionModel.obtenerInscripciones();
		res.json({ ok: true, inscripciones });
	} catch (error) {
		console.error('Error al listar inscripciones:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const obtenerInscripcion = async (req, res) => {
	try {
		const inscripcion = await inscripcionModel.obtenerInscripcionPorId(req.params.id);
		if (!inscripcion) {
			return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
		}
		res.json({ ok: true, inscripcion });
	} catch (error) {
		console.error('Error al obtener inscripción:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const crearInscripcion = async (req, res) => {
	try {
		const inscripcion = await inscripcionModel.crearInscripcion(req.body);
		res.status(201).json({ ok: true, inscripcion });
	} catch (error) {
		console.error('Error al crear inscripción:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const actualizarInscripcion = async (req, res) => {
	try {
		const inscripcion = await inscripcionModel.actualizarInscripcion(req.params.id, req.body);
		if (!inscripcion) {
			return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
		}
		res.json({ ok: true, inscripcion });
	} catch (error) {
		console.error('Error al actualizar inscripción:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const cambiarEstado = async (req, res) => {
	try {
		const inscripcion = await inscripcionModel.actualizarEstado(req.params.id, req.body.estado);
		if (!inscripcion) {
			return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
		}
		res.json({ ok: true, inscripcion });
	} catch (error) {
		console.error('Error al cambiar estado de inscripción:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

const cancelarInscripcion = async (req, res) => {
	try {
		const inscripcion = await inscripcionModel.cancelarInscripcion(req.params.id);
		if (!inscripcion) {
			return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
		}
		res.json({ ok: true, inscripcion });
	} catch (error) {
		console.error('Error al cancelar inscripción:', error);
		res.status(500).json({ ok: false, error: error.message });
	}
};

module.exports = {
	crearInscripcionPropia,
	listarInscripcionesPropias,
	listarInscripciones,
	obtenerInscripcion,
	crearInscripcion,
	actualizarInscripcion,
	cambiarEstado,
	cancelarInscripcion,
};
