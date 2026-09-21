const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDirectory = path.join(__dirname, '../../uploads/comprobantes');
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, callback) => callback(null, uploadDirectory),
  filename: (_, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `pago_${Date.now()}_${crypto.randomUUID()}${extension}`);
  },
});

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const uploadPaymentReceipt = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(new Error('El comprobante debe ser PDF, JPG o PNG.'));
    callback(null, true);
  },
}).single('comprobante');

module.exports = uploadPaymentReceipt;
