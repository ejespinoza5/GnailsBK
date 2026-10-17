import { usuarioAPublico } from '../mappers/usuario.mapper.js';

/**
 * Capa HTTP: recibe la petición ya validada, llama a los servicios y arma la
 * respuesta. Sin reglas de negocio ni SQL.
 */
export class AuthController {
  /**
   * @param {object} deps
   * @param {import('../services/AuthService.js').AuthService} deps.authService
   * @param {import('../services/SesionService.js').SesionService} deps.sesionService
   * @param {import('../http/CookieManager.js').CookieManager} deps.cookies
   */
  constructor({ authService, sesionService, verificacionService, cookies }) {
    this.auth = authService;
    this.verificacion = verificacionService;
    this.sesiones = sesionService;
    this.cookies = cookies;
  }

  /** Abre la sesión del usuario ya autenticado y responde. */
  async #abrirSesion(req, res, usuario, status = 200) {
    const tokens = await this.sesiones.iniciar(usuario, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      refreshPrevio: this.cookies.leerRefresh(req),
    });
    this.cookies.escribir(res, tokens);
    res.status(status).json({ usuario: usuarioAPublico(usuario) });
  }

  // POST /api/auth/registro
  registro = async (req, res) => {
    const usuario = await this.auth.registrar(req.body);
    // Se crea el código antes de responder; el correo sale en segundo plano.
    await this.verificacion.enviarCodigo(usuario, { forzar: true });
    await this.#abrirSesion(req, res, usuario, 201);
  };

  // POST /api/auth/login
  login = async (req, res) => {
    const usuario = await this.auth.login(req.body);
    await this.#abrirSesion(req, res, usuario);
  };

  // POST /api/auth/google
  google = async (req, res) => {
    const usuario = await this.auth.loginGoogle(req.body.credential);
    await this.#abrirSesion(req, res, usuario);
  };

  // POST /api/auth/refresh
  refresh = async (req, res) => {
    const { usuario, accessToken, refreshToken } = await this.sesiones.renovar(this.cookies.leerRefresh(req));
    this.cookies.escribir(res, { accessToken, refreshToken });
    res.json({ usuario: usuarioAPublico(usuario) });
  };

  // GET /api/auth/me
  me = async (req, res) => {
    const usuario = await this.auth.obtenerPerfil(req.auth.usuarioId);
    res.json({ usuario: usuarioAPublico(usuario) });
  };

  // POST /api/auth/logout
  logout = async (req, res) => {
    await this.sesiones.cerrar(this.cookies.leerRefresh(req));
    this.cookies.borrar(res);
    res.status(204).end();
  };

  // POST /api/auth/logout-todas
  logoutTodas = async (req, res) => {
    await this.sesiones.cerrarTodas(req.auth.usuarioId);
    this.cookies.borrar(res);
    res.status(204).end();
  };
}
