import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF (segunda capa, además de SameSite=Strict en la cookie):
 * toda petición que modifica algo debe venir de un origen permitido.
 */
export function verificarOrigen(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  let origen = req.get('origin');
  if (!origen) {
    const referer = req.get('referer');
    if (referer) {
      try {
        origen = new URL(referer).origin;
      } catch {
        origen = null;
      }
    }
  }

  if (!origen || !env.origenesPermitidos.includes(origen)) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
}

const opcionesBase = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
};

/** Frena ataques de fuerza bruta al login (por IP). */
export const limiteLogin = rateLimit({
  ...opcionesBase,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.' },
});

/** Renovación de sesión: generoso, solo para cortar abusos. */
export const limiteRefresh = rateLimit({
  ...opcionesBase,
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos.' },
});

/** Evita la creación masiva de cuentas (por IP). */
export const limiteRegistro = rateLimit({
  ...opcionesBase,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { error: 'Se crearon demasiadas cuentas desde esta conexión. Inténtalo más tarde.' },
});

/** Límite general para toda la API (por IP): corta scripts que la saturen. */
export const limiteGeneral = rateLimit({
  ...opcionesBase,
  windowMs: 5 * 60 * 1000,
  limit: 600,
  message: { error: 'Demasiadas solicitudes seguidas. Espera un momento.' },
});

/**
 * Reservar y cancelar (por usuaria, no por IP: varias clientas pueden
 * compartir el wifi del local). Se aplica después de requiereSesion.
 */
export const limiteReservas = rateLimit({
  ...opcionesBase,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `usuario:${req.auth.usuarioId}`,
  message: { error: 'Hiciste muchos cambios en poco tiempo. Inténtalo de nuevo en un rato.' },
});

/** Agendar desde el salón (por usuaria): generoso, solo corta abusos. */
export const limiteAgendaEquipo = rateLimit({
  ...opcionesBase,
  windowMs: 60 * 60 * 1000,
  limit: 300,
  keyGenerator: (req) => `usuario:${req.auth.usuarioId}`,
  message: { error: 'Demasiados cambios seguidos. Espera unos minutos.' },
});

/** Pedir enlaces de recuperación (por IP): evita usar la app para llenar bandejas ajenas. */
export const limiteRecuperacion = rateLimit({
  ...opcionesBase,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { error: 'Pediste varios enlaces seguidos. Revisa tu correo o inténtalo en 15 minutos.' },
});

/** Subir fotos (por usuaria): procesar imágenes cuesta CPU. */
export const limiteSubidas = rateLimit({
  ...opcionesBase,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `usuario:${req.auth.usuarioId}`,
  message: { error: 'Subiste muchas fotos seguidas. Inténtalo más tarde.' },
});

/** Pedir códigos de verificación (por usuaria). Además hay 60 s de espera entre códigos. */
export const limiteCodigos = rateLimit({
  ...opcionesBase,
  windowMs: 60 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => `usuario:${req.auth.usuarioId}`,
  message: { error: 'Pediste muchos códigos. Inténtalo en una hora.' },
});

/** Probar códigos (por usuaria). Cada código además admite solo 5 intentos. */
export const limiteVerificar = rateLimit({
  ...opcionesBase,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `usuario:${req.auth.usuarioId}`,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});
