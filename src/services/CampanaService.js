import { NoEncontradoError, ValidacionError } from '../errors/AppError.js';

/**
 * Responsabilidad única: las promociones y avisos que la dueña envía a sus clientas,
 * al momento o programados. Solo les llega a quienes aceptan promociones.
 */
export class CampanaService {
  constructor({ campanaRepo, notificacionRepo, notificacionService, zonaHoraria, logger = console }) {
    this.repo = campanaRepo;
    this.notifRepo = notificacionRepo;
    this.notif = notificacionService;
    this.zona = zonaHoraria;
    this.logger = logger;
  }

  listar() {
    return this.repo.listar();
  }

  audiencia() {
    return this.notifRepo.contarAudienciaPromociones();
  }

  async crear(usuarioId, { titulo, cuerpo, url, envio, fecha, hora }) {
    if (envio === 'programar') {
      const { ok, cerca } = await this.repo.enFuturo(fecha, hora, this.zona);
      if (!ok) throw new ValidacionError({ hora: 'Elige una fecha y hora futuras' });
      if (!cerca) throw new ValidacionError({ fecha: 'Se puede programar hasta 90 días adelante' });
    }
    const campana = await this.repo.crear({
      titulo,
      cuerpo,
      url,
      fecha,
      hora,
      zonaHoraria: this.zona,
      ahora: envio === 'ahora',
      creadaPor: usuarioId,
    });
    // "Enviar ahora" no espera al revisor de cada minuto.
    if (envio === 'ahora') {
      await this.procesarPendientes();
      return (await this.repo.listar()).find((c) => c.id === campana.id) ?? campana;
    }
    return campana;
  }

  async cancelar(id) {
    const c = await this.repo.cancelar(id);
    if (!c) throw new NoEncontradoError('Esa promoción ya se envió o no existe');
    return c;
  }

  /** Envía las campañas cuya hora llegó (lo llama el programador cada minuto). */
  async procesarPendientes() {
    const pendientes = await this.repo.reclamarPendientes();
    for (const c of pendientes) {
      const ids = await this.notifRepo.idsClientasPromociones();
      const r = await this.notif.notificar(ids, { tipo: 'promocion', titulo: c.titulo, cuerpo: c.cuerpo, url: c.url ?? '/' }, { categoria: 'promocion' });
      await this.repo.marcarEnviada(c.id, r.destinatarios);
      this.logger.log(`📣 Promoción «${c.titulo}» enviada a ${r.destinatarios} clientas`);
    }
    return pendientes.length;
  }
}
