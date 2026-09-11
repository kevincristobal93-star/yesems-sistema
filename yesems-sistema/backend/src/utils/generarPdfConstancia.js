const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generarPdfConstancia = (datos, folio) => {
  return new Promise((resolve, reject) => {
    const nombreArchivo = `constancia_${folio}.pdf`;
    const rutaCompleta = path.join(__dirname, '../../uploads/constancias', nombreArchivo);

    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const stream = fs.createWriteStream(rutaCompleta);
    doc.pipe(stream);

    doc.fontSize(20).text('YES EMS', { align: 'center' });
    doc.fontSize(14).text('Centro de Capacitación y Servicios Educativos', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(18).text('CONSTANCIA DE PARTICIPACIÓN', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12).text(
      `Se otorga la presente constancia a:`,
      { align: 'center' }
    );
    doc.moveDown();
    doc.fontSize(16).text(
      `${datos.alumno_nombre} ${datos.alumno_apellido}`,
      { align: 'center', underline: true }
    );
    doc.moveDown();
    doc.fontSize(12).text(
      `Por haber concluido satisfactoriamente el curso:`,
      { align: 'center' }
    );
    doc.moveDown();
    doc.fontSize(14).text(`"${datos.curso_nombre}"`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(
      `Con una duración de ${datos.duracion_horas} horas.`,
      { align: 'center' }
    );
    doc.moveDown(3);

    doc.fontSize(10).text(`Folio: ${folio}`, { align: 'left' });
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-MX')}`, { align: 'left' });

    doc.end();

    stream.on('finish', () => resolve(`/uploads/constancias/${nombreArchivo}`));
    stream.on('error', reject);
  });
};

module.exports = generarPdfConstancia;