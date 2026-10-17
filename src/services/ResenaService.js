import { NoEncontradoError, ReglaNegocioError } from '../errors/AppError.js';

/**
 * Responsabilidad única: las opiniones de las clientas.
 * Solo opina quien ya fue atendida (al menos una cita completada), una vez por
 * persona (puede editarla). Se publican al instante; la dueña puede ocultarlas y responder.
 */
export class ResenaService {
  constructor({ resenaRepo, cache, avisos = null, logger = console }) {
    this.resenaRepo = resenaRepo;
    this.cache = cache;
    this.avisos = avisos;
    this.logger = logger;
  }

  async mia(usuarioId) {
    const [resena, puede] = await Promise.all([
      this.resenaRepo.deUsuario(usuarioId),
      this.resenaRepo.tieneCitaCompletada(usuarioId),
    ]);
    return { puedeOpinar: puede, resena };
  }

  async guardar(usuarioId, datos) {
    if (!(await this.resenaRepo.tieneCitaCompletada(usuarioId))) {
      throw new ReglaNegocioError('Podrás dejar tu opinión después de tu primera cita.', 'SIN_CITA_COMPLETADA');
    }
    const anterior = await this.resenaRepo.deUsuario(usuarioId);
    const r = await this.resenaRepo.guardar(usuarioId, datos);
    this.cache.invalidar();
    // Solo la primera vez que opina (no cada vez que la edita).
    if (!anterior && this.avisos) {
      this.avisos.nuevaOpinion({ nombre: r.nombre, calificacion: r.calificacion }).catch((e) => this.logger.error('Aviso de opinión:', e.message));
    }
    return r;
  }

  async eliminar(usuarioId) {
    await this.resenaRepo.eliminarDeUsuario(usuarioId);
    this.cache.invalidar();
  }

  listar() {
    return this.resenaRepo.todas();
  }

  async moderar(id, datos) {
    const r = await this.resenaRepo.moderar(id, datos);
    if (!r) throw new NoEncontradoError('Reseña no encontrada');
    this.cache.invalidar();
    return r;
  }
}
