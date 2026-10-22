import { NoEncontradoError } from '../errors/AppError.js';
import { aHora, aMinutos, diaSemana, minutosHasta, sumarDias } from '../utils/tiempo.js';

/**
 * Responsabilidad única: calcular qué turnos están libres.
 * Cruza el horario del local, los días laborales y ausencias de cada
 * profesional, las citas ya tomadas y las reglas de reserva.
 * Es la misma lógica que valida una reserva: lo que se muestra es lo que se puede reservar.
 */
export class DisponibilidadService {
  constructor({ servicioRepo, profesionalRepo, agendaRepo, citaRepo, reloj }) {
    this.servicioRepo = servicioRepo;
    this.profesionalRepo = profesionalRepo;
    this.agendaRepo = agendaRepo;
    this.citaRepo = citaRepo;
    this.reloj = reloj;
  }

  /**
   * @param {object} o
   * @param {string} o.servicioId
   * @param {string|null} [o.profesionalId]  null = cualquier profesional
   * @param {string} o.desde                 'YYYY-MM-DD'
   * @param {number} [o.dias]                cuántos días calcular
   * @param {string|null} [o.excluirCitaId]  al reprogramar, la cita no choca consigo misma
   * @param {boolean} [o.modoAdmin]          la administradora no tiene límites de anticipación
   */
  async calcular({ servicioId, profesionalId = null, desde, dias = 7, excluirCitaId = null, modoAdmin = false }) {
    const servicio = await this.servicioRepo.buscarPorId(servicioId);
    if (!servicio || (!servicio.activo && !modoAdmin)) throw new NoEncontradoError('Este servicio no está disponible');

    let profesionales = await this.profesionalRepo.listarPorServicio(servicioId);
    if (profesionalId) {
      profesionales = profesionales.filter((p) => p.id === profesionalId);
      if (!profesionales.length) throw new NoEncontradoError('Esa profesional no realiza este servicio');
    }

    const hasta = sumarDias(desde, dias - 1);
    const [config, horario, bloqueos, ocupadas] = await Promise.all([
      this.agendaRepo.obtenerConfiguracion(),
      this.agendaRepo.obtenerHorario(),
      this.agendaRepo.listarBloqueos({ desde, hasta }),
      profesionales.length
        ? this.citaRepo.ocupadas({ desde, hasta, profesionalIds: profesionales.map((p) => p.id), excluirId: excluirCitaId })
        : [],
    ]);

    const contexto = {
      servicio,
      profesionales,
      config,
      horario: new Map(horario.map((h) => [h.diaSemana, h])),
      bloqueos,
      ocupadas,
      ahora: this.reloj.ahora(),
      modoAdmin,
    };

    const resultado = [];
    for (let i = 0; i < dias; i++) resultado.push(this.#dia(sumarDias(desde, i), contexto));

    return { servicio, profesionales, intervaloMin: config.intervaloMin, dias: resultado };
  }

  #dia(fecha, { servicio, profesionales, config, horario, bloqueos, ocupadas, ahora, modoAdmin }) {
    const cerrado = (estado, motivo) => ({ fecha, estado, motivo, horarios: [] });

    if (fecha < ahora.fecha) return cerrado('pasado', 'Esta fecha ya pasó');
    if (!modoAdmin && fecha > sumarDias(ahora.fecha, config.diasMaximos)) {
      return cerrado('fuera_de_rango', `Se reserva con hasta ${config.diasMaximos} días de anticipación`);
    }

    const dia = horario.get(diaSemana(fecha));
    if (!dia?.abierto) return cerrado('cerrado', 'El local no atiende este día');

    const bloqueoLocal = bloqueos.find((b) => b.fecha === fecha && !b.profesionalId);
    if (bloqueoLocal) return cerrado('cerrado', bloqueoLocal.motivo || 'El local estará cerrado');

    if ((servicio.disponibleDesde && fecha < servicio.disponibleDesde) || (servicio.disponibleHasta && fecha > servicio.disponibleHasta)) {
      return cerrado('no_disponible', 'Este servicio no se ofrece en esta fecha');
    }

    const apertura = aMinutos(dia.apertura);
    const cierre = aMinutos(dia.cierre);
    const duracion = servicio.duracionMin;
    const anticipacion = modoAdmin ? 0 : config.anticipacionMin;

    const libres = new Map(); // hora → [ids de profesionales libres]
    const carga = {}; // minutos ya ocupados por profesional (para repartir el trabajo)
    let alguienTrabaja = false;

    for (const p of profesionales) {
      if (!p.diasLaborales.includes(diaSemana(fecha))) continue;
      if (bloqueos.some((b) => b.fecha === fecha && b.profesionalId === p.id)) continue;
      alguienTrabaja = true;

      const suyas = ocupadas
        .filter((o) => o.profesionalId === p.id && o.fecha === fecha)
        .map((o) => [aMinutos(o.inicio), aMinutos(o.fin)]);
      carga[p.id] = suyas.reduce((t, [a, b]) => t + (b - a), 0);

      // La hora final del horario es la del último turno: a esa hora todavía se puede reservar.
      for (let t = apertura; t <= cierre && t + duracion <= 24 * 60; t += config.intervaloMin) {
        if (minutosHasta(ahora, fecha, aHora(t)) < anticipacion) continue;
        if (suyas.some(([ini, fin]) => t < fin && t + duracion > ini)) continue;
        const hora = aHora(t);
        if (!libres.has(hora)) libres.set(hora, []);
        libres.get(hora).push(p.id);
      }
    }

    if (!alguienTrabaja) return cerrado('cerrado', 'No hay profesionales disponibles este día');

    const horarios = [...libres.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, ids]) => ({ hora, profesionales: ids }));

    return {
      fecha,
      estado: horarios.length ? 'disponible' : 'completo',
      motivo: horarios.length ? null : 'Ya no quedan turnos libres este día',
      horarios,
      carga,
    };
  }
}
