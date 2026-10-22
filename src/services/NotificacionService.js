/**
 * Responsabilidad única: hacer llegar un aviso a personas concretas.
 * Siempre queda en su bandeja (campanita) y, si activó las push en algún
 * dispositivo, también le llega al celular o la computadora.
 *
 * Categorías:
 *  - "cita":         confirmaciones y cambios de sus citas. Llegan siempre.
 *  - "recordatorio": recordatorios automáticos o manuales. Se pueden apagar.
 *  - "promocion":    promociones de la dueña. Se pueden apagar.
 */
export class NotificacionService {
  constructor({ notificacionRepo, enviadorPush, logger = console }) {
    this.repo = notificacionRepo;
    this.push = enviadorPush;
    this.logger = logger;
  }

  /** @returns {Promise<{ destinatarios: number, dispositivos: number }>} */
  async notificar(usuarioIds, { tipo, titulo, cuerpo, url = null }, { categoria = 'cita' } = {}) {
    let ids = [...new Set(usuarioIds.filter(Boolean))];
    if (categoria !== 'cita') ids = await this.repo.filtrarPorPreferencia(ids, categoria);
    if (!ids.length) return { destinatarios: 0, dispositivos: 0 };

    await this.repo.crearParaVarios(ids, { tipo, titulo, cuerpo, url });

    const tokens = await this.repo.tokensDe(ids);
    let dispositivos = 0;
    try {
      const r = await this.push.enviar(tokens, { titulo, cuerpo, url: url ?? '/', tipo });
      dispositivos = r.entregados;
      // Tokens de navegadores que ya no existen (desinstalaron, borraron datos): se limpian.
      if (r.invalidos.length) await this.repo.eliminarTokens(r.invalidos);
    } catch (err) {
      // Si Firebase falla, el aviso igual quedó en la bandeja.
      this.logger.error('Push:', err.message);
    }
    return { destinatarios: ids.length, dispositivos };
  }

  /** Push de prueba a los dispositivos de la persona (no queda en la bandeja). */
  async probar(usuarioId) {
    const tokens = await this.repo.tokensDe([usuarioId]);
    const r = await this.push.enviar(tokens, {
      titulo: 'Notificación de prueba',
      cuerpo: '¡Funciona! Así te llegarán los avisos de Geovys Nails.',
      url: '/',
      tipo: 'prueba',
    });
    if (r.invalidos.length) await this.repo.eliminarTokens(r.invalidos);
    return { dispositivos: tokens.length, entregados: r.entregados };
  }

  // ---------- Bandeja de la persona

  async bandeja(usuarioId) {
    const [notificaciones, noLeidas] = await Promise.all([this.repo.listar(usuarioId), this.repo.contarNoLeidas(usuarioId)]);
    return { notificaciones, noLeidas };
  }

  marcarLeidas(usuarioId, ids) {
    return this.repo.marcarLeidas(usuarioId, ids);
  }

  registrarDispositivo(usuarioId, token, userAgent) {
    return this.repo.guardarDispositivo(usuarioId, token, userAgent?.slice(0, 300) ?? null);
  }

  quitarDispositivo(usuarioId, token) {
    return this.repo.quitarDispositivo(usuarioId, token);
  }

  preferencias(usuarioId) {
    return this.repo.preferencias(usuarioId);
  }

  guardarPreferencias(usuarioId, datos) {
    return this.repo.guardarPreferencias(usuarioId, datos);
  }

  get pushActivo() {
    return this.push.activo;
  }
}
