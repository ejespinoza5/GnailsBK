import { AppError, NoAutenticadoError, ProhibidoError } from '../errors/AppError.js';

/**
 * Middlewares de autenticación. Reciben sus dependencias (inyección)
 * en lugar de importarlas, así se pueden probar o reemplazar fácilmente.
 *
 * @param {object} deps
 * @param {import('../services/TokenService.js').TokenService} deps.tokenService
 * @param {import('../http/CookieManager.js').CookieManager} deps.cookies
 */
export function crearMiddlewaresAuth({ tokenService, cookies, usuarioRepo, profesionalRepo }) {
  /** Si el JWT es válido deja { usuarioId, rol, sesionId } en req.auth. No consulta la BDD. */
  async function autenticar(req, res, next) {
    const token = cookies.leerAccess(req);
    if (token) {
      try {
        req.auth = await tokenService.verificarAccess(token);
      } catch (err) {
        req.errorAuth = err; // TokenExpiradoError o NoAutenticadoError
      }
    }
    next();
  }

  function requiereSesion(req, res, next) {
    if (!req.auth) throw req.errorAuth ?? new NoAutenticadoError();
    next();
  }

  function requiereRol(...roles) {
    return (req, res, next) => {
      if (!req.auth) throw req.errorAuth ?? new NoAutenticadoError();
      if (!roles.includes(req.auth.rol)) throw new ProhibidoError();
      next();
    };
  }

  /**
   * Exige el correo verificado (va después de requiereSesion). Consulta la BDD
   * para que el cambio valga al instante, sin esperar a que se renueve el JWT.
   */
  async function requiereEmailVerificado(req, res, next) {
    const usuario = await usuarioRepo.buscarPorId(req.auth.usuarioId);
    if (!usuario?.emailVerificado) {
      throw new AppError('Confirma tu correo con el código que te enviamos para poder reservar.', 403, {
        codigo: 'EMAIL_NO_VERIFICADO',
      });
    }
    next();
  }

  /**
   * Para la agenda del equipo: la dueña (todo) o una profesional con acceso (solo lo suyo).
   * Se consulta la BDD en cada petición: si la dueña le quita el acceso, deja de funcionar al instante
   * (no espera a que venza el JWT).
   */
  async function requiereEquipo(req, res, next) {
    if (!req.auth) throw req.errorAuth ?? new NoAutenticadoError();
    const usuario = await usuarioRepo.buscarPorId(req.auth.usuarioId);
    if (!usuario?.activo) throw new NoAutenticadoError();

    if (usuario.rol === 'admin') {
      req.alcance = { rol: 'admin', usuarioId: usuario.id, profesionalId: null };
    } else if (usuario.rol === 'profesional') {
      const profesional = await profesionalRepo.buscarPorUsuario(usuario.id);
      if (!profesional?.activo) throw new ProhibidoError('Tu acceso como profesional no está activo. Habla con la administradora.');
      req.alcance = { rol: 'profesional', usuarioId: usuario.id, profesionalId: profesional.id };
    } else {
      throw new ProhibidoError();
    }
    next();
  }

  return { autenticar, requiereSesion, requiereRol, requiereEmailVerificado, requiereEquipo };
}
