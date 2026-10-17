import { SesionExpiradaError, NoAutenticadoError } from '../errors/AppError.js';

/**
 * Responsabilidad única: ciclo de vida de las sesiones
 * (abrir, renovar con rotación, cerrar). No sabe nada de cookies ni de HTTP.
 */
export class SesionService {
  /**
   * @param {object} deps
   * @param {import('../repositories/SesionRepository.js').SesionRepository} deps.sesionRepo
   * @param {import('../repositories/UsuarioRepository.js').UsuarioRepository} deps.usuarioRepo
   * @param {import('./TokenService.js').TokenService} deps.tokenService
   * @param {number} [deps.segundosGracia] margen para pestañas que renuevan a la vez
   * @param {{ warn: Function }} [deps.logger]
   */
  constructor({ sesionRepo, usuarioRepo, tokenService, segundosGracia = 30, logger = console }) {
    this.sesionRepo = sesionRepo;
    this.usuarioRepo = usuarioRepo;
    this.tokens = tokenService;
    this.graciaMs = segundosGracia * 1000;
    this.logger = logger;
  }

  /**
   * Abre una sesión nueva (tokens nuevos siempre: evita fijación de sesión).
   * Si el navegador traía otra sesión, se cierra.
   */
  async iniciar(usuario, { ip = null, userAgent = null, refreshPrevio = null } = {}) {
    if (refreshPrevio) await this.cerrar(refreshPrevio);

    const refreshToken = this.tokens.generarRefresh();
    const sesionId = await this.sesionRepo.crear({
      usuarioId: usuario.id,
      tokenHash: this.tokens.hashRefresh(refreshToken),
      expiraEn: this.tokens.expiracionRefresh(),
      ip,
      userAgent: userAgent?.slice(0, 500) ?? null,
    });

    const accessToken = await this.tokens.firmarAccess({ usuarioId: usuario.id, rol: usuario.rol, sesionId });
    return { accessToken, refreshToken };
  }

  /**
   * Cambia un refresh token por un access token nuevo y un refresh token nuevo.
   * @returns {{ usuario, accessToken, refreshToken: string | null }}
   *          refreshToken es null cuando no hay que reemplazar la cookie (periodo de gracia).
   */
  async renovar(refreshToken) {
    if (!refreshToken) throw new NoAutenticadoError();

    const hashActual = this.tokens.hashRefresh(refreshToken);
    const refreshNuevo = this.tokens.generarRefresh();

    // Caso normal: token vigente → se rota y la sesión se extiende.
    const rotada = await this.sesionRepo.rotar({
      tokenHashActual: hashActual,
      tokenHashNuevo: this.tokens.hashRefresh(refreshNuevo),
      expiraEn: this.tokens.expiracionRefresh(),
    });
    if (rotada) return this.#emitirPara(rotada, refreshNuevo);

    // ¿Es un token que ya fue reemplazado?
    const anterior = await this.sesionRepo.buscarPorTokenAnterior(hashActual);
    if (!anterior) throw new SesionExpiradaError();

    const enGracia = Date.now() - new Date(anterior.rotadoEn).getTime() < this.graciaMs;
    if (enGracia) {
      // Dos pestañas renovando a la vez: la otra ya dejó la cookie nueva.
      return this.#emitirPara(anterior, null);
    }

    // Reutilización de un token viejo: posible robo. Se revoca la sesión completa.
    this.logger.warn(`⚠️  Refresh token reutilizado. Sesión ${anterior.id} revocada (usuario ${anterior.usuarioId}).`);
    await this.sesionRepo.eliminarPorId(anterior.id);
    throw new SesionExpiradaError();
  }

  async #emitirPara(sesion, refreshToken) {
    const usuario = await this.usuarioRepo.buscarPorId(sesion.usuarioId);
    if (!usuario?.activo) {
      await this.sesionRepo.eliminarPorId(sesion.id);
      throw new SesionExpiradaError();
    }
    const accessToken = await this.tokens.firmarAccess({ usuarioId: usuario.id, rol: usuario.rol, sesionId: sesion.id });
    return { usuario, accessToken, refreshToken };
  }

  async cerrar(refreshToken) {
    if (refreshToken) await this.sesionRepo.eliminarPorToken(this.tokens.hashRefresh(refreshToken));
  }

  cerrarTodas(usuarioId) {
    return this.sesionRepo.eliminarDeUsuario(usuarioId);
  }

  limpiarVencidas() {
    return this.sesionRepo.eliminarVencidas();
  }
}
