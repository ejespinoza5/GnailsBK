import sharp from 'sharp';
import { ValidacionError } from '../errors/AppError.js';

const FORMATOS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif']);

/**
 * Responsabilidad única: convertir la foto subida en un avatar liviano y seguro.
 * Se decide por el CONTENIDO del archivo (no por su nombre ni su tipo declarado),
 * se re-codifica a WebP (así se descarta cualquier cosa escondida en el archivo)
 * y se eliminan los metadatos (ubicación GPS, cámara...).
 */
export class ProcesadorImagen {
  constructor({ lado = 320, calidad = 80, maxPixeles = 40_000_000 } = {}) {
    this.lado = lado;
    this.calidad = calidad;
    this.maxPixeles = maxPixeles;
  }

  /**
   * Fotos de la página (portada y galería): versión grande para verla completa
   * y miniatura para la cuadrícula. Se respeta la proporción original.
   */
  async fotoSitio(buffer, { anchoMax = 1800, miniatura = 720, calidad = 80 } = {}) {
    try {
      const base = sharp(buffer, { limitInputPixels: this.maxPixeles, failOn: 'error', animated: false });
      const { format } = await base.metadata();
      if (!FORMATOS.has(format)) throw new Error('formato');

      const rotada = await base.rotate().toBuffer(); // aplica la orientación del celular una sola vez
      const grande = await sharp(rotada)
        .resize(anchoMax, anchoMax, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: calidad, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      const mini = await sharp(rotada)
        .resize(miniatura, miniatura, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 74, effort: 4 })
        .toBuffer();

      return { imagen: grande.data, miniatura: mini, ancho: grande.info.width, alto: grande.info.height };
    } catch {
      throw new ValidacionError({ foto: 'No pudimos leer la imagen. Usa una foto JPG, PNG o WebP.' }, 'Imagen no válida');
    }
  }

  async avatar(buffer) {
    try {
      const imagen = sharp(buffer, { limitInputPixels: this.maxPixeles, failOn: 'error', animated: false });
      const { format } = await imagen.metadata();
      if (!FORMATOS.has(format)) throw new Error('formato');

      return await imagen
        .rotate() // respeta la orientación con que se tomó la foto en el celular
        .resize(this.lado, this.lado, { fit: 'cover', position: 'attention' })
        .webp({ quality: this.calidad, effort: 4 })
        .toBuffer();
    } catch {
      throw new ValidacionError({ foto: 'No pudimos leer la imagen. Usa una foto JPG, PNG o WebP.' }, 'Imagen no válida');
    }
  }
}
