import multer from 'multer';

/**
 * Fotos de la página (portada y galería): en memoria, máx. 10 MB y un solo archivo.
 * sharp la re-codifica antes de guardarla; nunca se escribe al disco tal cual llegó.
 */
export const subirFotoSitio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 200, parts: 3 },
}).single('foto');
