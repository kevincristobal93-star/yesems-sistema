const formats = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation', rtf: 'application/rtf',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', epub: 'application/epub+zip',
  zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
const MAX = 5 * 1024 * 1024;
function contentMatches(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX || !Object.hasOwn(formats, extension)) return false;
  const starts = hex => buffer.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  // Basic container checks, not antivirus or full document parsing. Files are never executed or extracted.
  if (extension === 'pdf') return /^%PDF-\d\.\d/.test(buffer.subarray(0, 8).toString()) && /%%EOF\s*$/.test(buffer.subarray(-1024).toString('latin1'));
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'zip'].includes(extension)) return starts('504b0304') || (extension === 'zip' && starts('504b0506'));
  if (['doc', 'xls', 'ppt'].includes(extension)) return starts('d0cf11e0a1b11ae1');
  if (extension === 'rtf') return buffer.subarray(0, 5).toString() === '{\\rtf';
  if (['jpg', 'jpeg'].includes(extension)) return starts('ffd8ff');
  if (extension === 'png') return starts('89504e470d0a1a0a');
  if (extension === 'webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return !buffer.includes(0) && !starts('4d5a'); } catch { return false; }
}
module.exports = { formats, MAX, contentMatches };
