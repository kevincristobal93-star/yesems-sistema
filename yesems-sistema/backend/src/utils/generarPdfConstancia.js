const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generarPdfConstancia = (datos, folio) => new Promise((resolve, reject) => {
  const nombreArchivo = `constancia_${folio}.pdf`;
  const directorioConstancias = path.join(__dirname, '../../uploads/constancias');
  const rutaCompleta = path.join(directorioConstancias, nombreArchivo);
  const rutaLogo = path.join(__dirname, '../../../frontend/assets/yesems-logo.png');
  fs.mkdirSync(directorioConstancias, { recursive: true });

  const doc = new PDFDocument({ size: 'letter', layout: 'landscape', margin: 0 });
  const stream = fs.createWriteStream(rutaCompleta);
  doc.pipe(stream);

  const width = doc.page.width;
  const height = doc.page.height;
  const navy = '#082b45';
  const blue = '#176b87';
  const gold = '#f5b942';
  const ink = '#17233d';
  const muted = '#60748a';
  const alumno = `${datos.alumno_nombre || ''} ${datos.alumno_apellido || ''}`.trim().toUpperCase();
  const fecha = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();

  doc.rect(0, 0, width, height).fill('#ffffff');
  doc.rect(0, 0, width, 18).fill(navy);
  doc.rect(0, height - 18, width, 18).fill(navy);
  doc.lineWidth(2).strokeColor(gold).rect(28, 31, width - 56, height - 62).stroke();
  doc.lineWidth(1).strokeColor('#d8e4ea').rect(38, 41, width - 76, height - 82).stroke();
  doc.save().opacity(0.06).circle(width - 50, 76, 115).fill(blue).circle(68, height - 48, 105).fill(gold).restore();

  if (fs.existsSync(rutaLogo)) doc.image(rutaLogo, 58, 55, { fit: [82, 82] });
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text('YES EMS', 150, 63, { width: 300 });
  doc.fillColor(blue).font('Helvetica').fontSize(8.5).text('CENTRO DE CAPACITACIÓN Y SERVICIOS EDUCATIVOS', 150, 87, { width: 355, characterSpacing: 0.5 });
  doc.fillColor(muted).fontSize(8).text('Capacitación, certificación y tecnología para transformar tu futuro.', 150, 104, { width: 390 });
  doc.fillColor(gold).font('Helvetica-Bold').fontSize(8.5).text(`FOLIO  ${folio}`, width - 255, 68, { width: 170, align: 'right', characterSpacing: 0.5 });
  doc.fillColor(muted).font('Helvetica').fontSize(8.5).text(`EMISIÓN  ${fecha}`, width - 275, 88, { width: 190, align: 'right' });

  doc.moveTo(78, 145).lineTo(width - 78, 145).strokeColor('#d5e2e7').lineWidth(1).stroke();
  doc.fillColor(gold).font('Helvetica-Bold').fontSize(10).text('RECONOCIMIENTO ACADÉMICO', 0, 168, { align: 'center', characterSpacing: 2 });
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(31).text('CONSTANCIA DE PARTICIPACIÓN', 0, 191, { align: 'center' });
  doc.fillColor(muted).font('Helvetica').fontSize(11.5).text('Se otorga la presente constancia a:', 0, 247, { align: 'center' });
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(24).text(alumno, 95, 272, { width: width - 190, align: 'center' });
  doc.moveTo(width * 0.27, 309).lineTo(width * 0.73, 309).strokeColor(gold).lineWidth(1.5).stroke();
  doc.fillColor(muted).font('Helvetica').fontSize(11.5).text('por haber concluido satisfactoriamente la capacitación:', 0, 329, { align: 'center' });
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(17).text(`“${datos.curso_nombre || 'Curso YES EMS'}”`, 100, 353, { width: width - 200, align: 'center' });
  doc.fillColor(ink).font('Helvetica').fontSize(11).text(`Con una duración de ${datos.duracion_horas || 0} horas.`, 0, 386, { align: 'center' });

  const signY = 451;
  doc.moveTo(125, signY).lineTo(310, signY).strokeColor('#9fb2bd').lineWidth(1).stroke();
  doc.moveTo(width - 310, signY).lineTo(width - 125, signY).strokeColor('#9fb2bd').lineWidth(1).stroke();
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('DIRECCIÓN ACADÉMICA', 125, signY + 10, { width: 185, align: 'center' });
  doc.fillColor(muted).font('Helvetica').fontSize(8).text('YES EMS', 125, signY + 24, { width: 185, align: 'center' });
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('VALIDACIÓN INSTITUCIONAL', width - 310, signY + 10, { width: 185, align: 'center' });
  doc.fillColor(muted).font('Helvetica').fontSize(8).text(`Folio verificable: ${folio}`, width - 310, signY + 24, { width: 185, align: 'center' });
  doc.fillColor('#9aacb7').fontSize(7.5).text('Documento emitido digitalmente por YES EMS · Servicios Educativos', 0, height - 38, { align: 'center' });
  doc.end();

  stream.on('finish', () => resolve(`/uploads/constancias/${nombreArchivo}`));
  stream.on('error', reject);
});

module.exports = generarPdfConstancia;
