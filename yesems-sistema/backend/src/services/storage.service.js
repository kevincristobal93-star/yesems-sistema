const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

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
  const publicId = path.basename(filePath, extension);
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    folder,
    public_id: publicId,
    overwrite: true,
  });
  fs.unlinkSync(filePath);
  return result.secure_url;
};

module.exports = { cloudinaryEnabled, guardarArchivoPermanente, isRemoteFile };
