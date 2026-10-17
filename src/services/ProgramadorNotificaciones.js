import { Reloj, fechaParaAviso, horaParaAviso } from '../utils/tiempo.js';

const CORTOS = [5, 15, 30]; // minutos antes de la cita
const DIA_ANTERIOR = 1440;

/**
 * Decide qué recordatorio toca para una cita según los minutos que faltan.
 * Función pura (sin BDD) para poder probarla sola.
 *  - Se toma el umbral más chico que ya se alcanzó: 30, 15 o 5 minutos.
 *    Si el servidor estuvo caído y faltan 4 min, se manda el de 5 (no los tres juntos).
 *  - Si la cita se creó hace menos de 10 min, no se recuerda (acaba de recibir la confirmación).
 *  - El del día anterior solo si reservó con al menos 24 h de anticipación.
 */
export function umbralRecordatorio({ minutos, minutosDesdeCreada, anticipacion }) {
  if (minutos <= 0) return null;
  const corto = CORTOS.find((u) => minutos <= u);
  if (corto) return minutosDesdeCreada >= 10 ? corto : null;
  if (minutos <= DIA_ANTERIOR && anticipacion >= DIA_ANTERIOR) return DIA_ANTERIOR;
  return null;
}

/**
 * Responsabilidad única: lo que pasa solo con el tiempo.
 * Cada minuto revisa los recordatorios de citas y las promociones programadas.
 * Cada envío se "reclama" en la BDD antes de hacerse: nunca se envía dos veces,
 * aunque haya dos servidores o el revisor se ejecute dos veces seguidas.
 */
export class ProgramadorNotificaciones {
  constructor({ notificacionRepo, notificacionService, campanaService, zonaHoraria, agendaRepo = null, logger = console }) {
    this.repo = notificacionRepo;
    this.notif = notificacionService;
    this.campanas = campanaService;
    this.agendaRepo = agendaRepo;
    this.zona = zonaHoraria;
    this.reloj = new Reloj(zonaHoraria);
    this.logger = logger;
    this.enCurso = false;
  }

  iniciar(intervaloS) {
    const ciclo = () => this.revisar().catch((e) => this.logger.error('Notificaciones programadas:', e.message));
    ciclo();
    this.temporizador = setInterval(ciclo, intervaloS * 1000);
    this.temporizador.unref();
    // Limpieza diaria de la bandeja (avisos de más de 90 días)
    setInterval(() => this.repo.eliminarViejas(90).catch(() => {}), 24 * 60 * 60 * 1000).unref();
  }

  async revisar() {
    if (this.enCurso) return; // si una vuelta tarda, no se solapa con la siguiente
    this.enCurso = true;
    try {
      await this.recordatorios();
      await this.campanas.procesarPendientes();
    } finally {
      this.enCurso = false;
    }
  }

  async recordatorios() {
    const citas = await this.repo.citasProximas(this.zona);
    let enviados = 0;
    // "Recuerda llegar 5 minutitos antes…" va en el recordatorio del día anterior y en el de 30 minutos.
    const mensaje = citas.length && this.agendaRepo ? (await this.agendaRepo.obtenerConfiguracion()).mensajeReserva : '';
    for (const cita of citas) {
      const umbral = umbralRecordatorio(cita);
      if (!umbral || !(await this.repo.reclamarRecordatorio(cita.id, umbral))) continue;

      // Hacia arriba: a los 29,6 min dice «30 minutos» (lo pedido), nunca menos de lo que falta.
      const faltan = Math.max(1, Math.ceil(cita.minutos));
      const aviso =
        umbral === DIA_ANTERIOR
          ? {
              titulo: 'Recordatorio de tu cita',
              cuerpo: `${fechaParaAviso(cita.fecha, { hoy: this.reloj.ahora().fecha, mayuscula: true })} a las ${horaParaAviso(cita.hora)}: ${cita.servicio} con ${cita.profesional}.${mensaje ? ` ${mensaje}` : ' ¡Te esperamos!'}`,
            }
          : {
              titulo: `Tu cita es en ${faltan} minuto${faltan === 1 ? '' : 's'}`,
              cuerpo: `${cita.servicio} con ${cita.profesional} a las ${horaParaAviso(cita.hora)}${umbral === 30 && mensaje ? ` ${mensaje}` : ' ¡Ya casi!'}`,
            };
      await this.notif.notificar([cita.clienteId], { tipo: 'recordatorio', url: '/mis-turnos', ...aviso }, { categoria: 'recordatorio' });
      enviados++;
    }
    return enviados;
  }
}
