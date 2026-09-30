const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { httpError } = require('../utils/http-error');

const cloudinaryEnabled = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const isRemoteFile = (fileUrl) => /^https:\/\//i.test(fileUrl || '');

const guardarArchivoPermanente = async (filePath, folder) => {
  if (!cloudinaryEnabled) return null;
  const extension = path.extname(filePath);
  // Los identificadores no contienen nombres del alumno ni folios predecibles.
  const publicId = `${randomUUID()}${extension}`;
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    type: 'authenticated',
    folder,
    public_id: publicId,
    overwrite: false,
  });
  fs.unlinkSync(filePath);
  return result.secure_url;
};

// La API firma la descarga después de comprobar el propietario; nunca entrega
// esta firma al navegador. Los enlaces públicos históricos se mantienen hasta
// que la institución apruebe su migración en Cloudinary.
function obtenerUrlDescarga(fileUrl) {
  let url;
  try { url = new URL(fileUrl); } catch { throw httpError(502, 'La ubicación del documento no es válida'); }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password ||
      (url.port && url.port !== '443') || url.search || url.hash) {
    throw httpError(502, 'La ubicación del documento no es válida');
  }
  const match = url.pathname.match(/^\/([^/]+)\/raw\/(upload|authenticated|private)\/(?:v\d+\/)?(.+)$/);
  if (!match) throw httpError(502, 'La ubicación del documento no es válida');
  const [, cloudName, type, encodedId] = match;
  if (type === 'upload') return url.toString();
  if (!cloudinaryEnabled || cloudName !== process.env.CLOUDINARY_CLOUD_NAME) {
    throw httpError(503, 'Falta configurar el almacenamiento privado de documentos');
  }
  let publicId;
  try { publicId = decodeURIComponent(encodedId); } catch { throw httpError(502, 'La ubicación del documento no es válida'); }
  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw', type, expires_at: Math.floor(Date.now() / 1000) + 60,
  });
}

module.exports = { cloudinaryEnabled, guardarArchivoPermanente, isRemoteFile, obtenerUrlDescarga };
