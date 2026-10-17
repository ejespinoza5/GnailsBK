import multer from 'multer';
import { AppError } from '../errors/AppError.js';

// Restricción UNIQUE de la BDD → [mensaje, campo del formulario]
const MENSAJES_UNICOS = {
  uq_usuarios_email: ['Este correo ya está registrado', 'email'],
  uq_usuarios_google_id: ['Esta cuenta de Google ya está registrada'],
  uq_servicios_nombre: ['Ya existe un servicio con ese nombre', 'nombre'],
  uq_dias_bloqueados_local: ['Ese día ya está bloqueado', 'fecha'],
  uq_dias_bloqueados_profesional: ['Ese día ya está bloqueado para esta profesional', 'fecha'],
};

export function noEncontrado(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

/** Único lugar donde los errores se convierten en respuestas HTTP. */
export function crearManejadorErrores({ cookies, logger = console }) {
  // eslint-disable-next-line no-unused-vars
  return function manejadorErrores(err, req, res, next) {
    if (err instanceof AppError) {
      // Sesión expirada o revocada: también se limpian las cookies del navegador.
      if (err.codigo === 'SESION_EXPIRADA') cookies.borrar(res);
      return res.status(err.status).json({ error: err.message, codigo: err.codigo, campos: err.campos });
    }

    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa más de 5 MB' : 'Envía una sola foto en el campo «foto»';
      return res.status(400).json({ error: mensaje, campos: { foto: mensaje } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'La petición es demasiado grande' });
    }
    // Violación de UNIQUE en PostgreSQL (p. ej. dos registros simultáneos con el mismo correo)
    if (err.code === '23505') {
      const [mensaje = 'Ya existe un registro con esos datos', campo] = MENSAJES_UNICOS[err.constraint] ?? [];
      return res.status(409).json({ error: mensaje, campos: campo ? { [campo]: mensaje } : undefined });
    }
    // Dos citas de la misma profesional que se cruzan (restricción EXCLUDE)
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Ese horario ya está ocupado. Elige otro, por favor.' });
    }

    // Al cliente nunca se le muestran detalles internos (SQL, rutas, stack).
    logger.error(err);
    res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  };
}
