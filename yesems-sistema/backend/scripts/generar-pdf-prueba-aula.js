const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const output = path.resolve(__dirname, '../../docs/ejemplos/Manual_prueba_aula_virtual.pdf');
fs.mkdirSync(path.dirname(output), { recursive: true });

const pdf = new PDFDocument({ size: 'LETTER', margin: 55, info: {
  Title: 'Manual de prueba del aula virtual YES EMS',
  Author: 'YES EMS',
  Subject: 'Material ficticio para verificar la carga y descarga de PDF',
} });
pdf.pipe(fs.createWriteStream(output));

pdf.font('Helvetica-Bold').fontSize(21).fillColor('#123657')
  .text('Manual de prueba del aula virtual');
pdf.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#526578')
  .text('YES EMS | Material de demostración | No corresponde a un curso oficial');
pdf.moveDown(1).fontSize(12).fillColor('#182b3c')
  .text('Este archivo permite comprobar que un administrador puede subir un PDF a un módulo y que un alumno autorizado puede abrirlo o descargarlo.');
pdf.moveDown(1).font('Helvetica-Bold').fontSize(14).text('Actividad de ejemplo: impresión 3D');
pdf.moveDown(0.5).font('Helvetica').fontSize(11)
  .text('1. Identifica las partes principales de una impresora 3D.')
  .text('2. Describe para qué sirve un archivo de diseño digital.')
  .text('3. Escribe una idea de objeto sencillo para imprimir.');
pdf.moveDown(1).font('Helvetica-Bold').fontSize(14).text('Comprobación del sistema');
pdf.moveDown(0.5).font('Helvetica').fontSize(11)
  .text('1. Crea un módulo de prueba en un curso existente.')
  .text('2. Sube este PDF y publica el módulo.')
  .text('3. Entra con una cuenta de alumno inscrita y con acceso autorizado.')
  .text('4. Verifica que el PDF se abra y que el contenido coincida con este ejemplo.')
  .text('5. Oculta el módulo y comprueba que el alumno ya no pueda acceder.');
pdf.moveDown(1.2).fontSize(9).fillColor('#526578')
  .text('Aviso: este documento es ficticio y no acredita asistencia, progreso ni constancia.');
pdf.end();

pdf.on('end', () => console.log(output));
