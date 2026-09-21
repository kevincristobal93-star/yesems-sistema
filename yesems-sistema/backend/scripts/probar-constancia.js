require('dotenv').config();

const pool = require('../src/config/db');
const constanciaModel = require('../src/models/constancia.model');
const generarPdfConstancia = require('../src/utils/generarPdfConstancia');

const ID_INSCRIPCION_PRUEBA = 5;

async function ejecutarPrueba() {
  const inscripcionResult = await pool.query(
    "UPDATE inscripciones SET estado = 'completada' WHERE id_inscripcion = $1 RETURNING id_inscripcion, estado",
    [ID_INSCRIPCION_PRUEBA]
  );
  if (!inscripcionResult.rows[0]) throw new Error('No se encontró la inscripción de prueba.');

  const existente = await constanciaModel.obtenerConstanciaPorInscripcion(ID_INSCRIPCION_PRUEBA);
  const solicitud = existente || await constanciaModel.crearSolicitud(ID_INSCRIPCION_PRUEBA);
  const datos = await constanciaModel.obtenerDatosParaPdf(ID_INSCRIPCION_PRUEBA);
  const folio = solicitud.folio?.startsWith('YESEMS-')
    ? solicitud.folio
    : `YESEMS-${new Date().getFullYear()}-${String(solicitud.id_constancia).padStart(4, '0')}`;
  const archivoUrl = await generarPdfConstancia(datos, folio);
  const constancia = await constanciaModel.autorizarConstancia(solicitud.id_constancia, folio, archivoUrl);

  console.table([{
    id_inscripcion: inscripcionResult.rows[0].id_inscripcion,
    estado_inscripcion: inscripcionResult.rows[0].estado,
    id_constancia: constancia.id_constancia,
    estado_constancia: constancia.estado,
    folio: constancia.folio,
    archivo: constancia.archivo_url,
  }]);
}

ejecutarPrueba()
  .catch((error) => { console.error('La prueba falló:', error.message); process.exitCode = 1; })
  .finally(() => pool.end());
