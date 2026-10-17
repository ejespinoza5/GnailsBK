import { fechaParaAviso, horaParaAviso } from '../utils/tiempo.js';

/**
 * Responsabilidad única: decidir QUIÉN se entera de cada cambio en una cita y QUÉ se le dice.
 *  - La clienta: de todo lo que pasa con su cita (si tiene cuenta).
 *  - La dueña: de las citas nuevas, las cancelaciones de clientas y las opiniones.
 *  - La profesional: de las citas nuevas, cambios y cancelaciones de su agenda.
 * Nadie recibe aviso de algo que hizo ella misma.
 */
export class AvisosCitas {
  constructor({ notificacionService, notificacionRepo, profesionalRepo, agendaRepo = null, logger = console }) {
    this.notif = notificacionService;
    this.repo = notificacionRepo;
    this.profesionalRepo = profesionalRepo;
    this.agendaRepo = agendaRepo;
    this.logger = logger;
  }

  async #equipo(cita) {
    const [admins, profesional] = await Promise.all([
      this.repo.idsAdministradoras(),
      this.profesionalRepo.buscarPorId(cita.profesionalId),
    ]);
    const profesionalUsuarioId = profesional?.cuenta?.id ?? null;
    // Si la dueña también atiende (su cuenta es la de la profesional), recibe un solo aviso.
    return { admins: admins.filter((id) => id !== profesionalUsuarioId), profesionalUsuarioId };
  }

  #cuando(cita) {
    return `${fechaParaAviso(cita.fecha)} a las ${horaParaAviso(cita.horaInicio)}`;
  }

  /** El mensaje que la dueña configuró ("Recuerda llegar 5 minutitos antes…"), con un espacio delante. */
  async #mensaje() {
    const texto = this.agendaRepo ? (await this.agendaRepo.obtenerConfiguracion()).mensajeReserva : '';
    return texto ? ` ${texto}` : '';
  }

  async #enviar(ids, actorId, aviso, opciones) {
    const destino = ids.filter((id) => id && id !== actorId);
    if (destino.length) await this.notif.notificar(destino, aviso, opciones);
  }

  /** Cita nueva (la reservó la clienta o la agendó el salón). */
  async reservada(cita, actorId) {
    const { admins, profesionalUsuarioId } = await this.#equipo(cita);
    // La clienta siempre recibe la confirmación (aunque haya reservado ella): le queda el registro
    // en la campanita y le llega a sus otros dispositivos.
    await this.#enviar([cita.clienteId], null, {
      tipo: 'cita_confirmada',
      titulo: 'Tu cita está confirmada',
      cuerpo: `${cita.servicioNombre} con ${cita.profesionalNombre}, ${this.#cuando(cita)}.${await this.#mensaje()}`.replace('m..', 'm.'),
      url: '/mis-turnos',
    });
    const nueva = {
      tipo: 'cita_nueva',
      titulo: 'Nueva cita',
      cuerpo: `${cita.clienteNombre} · ${cita.servicioNombre} con ${cita.profesionalNombre}, ${this.#cuando(cita)}`,
    }
    await this.#enviar(admins, actorId, { ...nueva, url: `/admin?fecha=${cita.fecha}` });
    // La profesional abre su agenda, no la de la dueña.
    await this.#enviar([profesionalUsuarioId], actorId, { ...nueva, url: `/equipo?fecha=${cita.fecha}` });
  }

  async reprogramada(cita, actorId) {
    const { profesionalUsuarioId } = await this.#equipo(cita);
    await this.#enviar([cita.clienteId], actorId, {
      tipo: 'cita_reprogramada',
      titulo: 'Tu cita cambió de horario',
      cuerpo: `Ahora es ${this.#cuando(cita)} con ${cita.profesionalNombre}.`,
      url: '/mis-turnos',
    });
    await this.#enviar([profesionalUsuarioId], actorId, {
      tipo: 'cita_reprogramada',
      titulo: 'Cita reprogramada',
      cuerpo: `${cita.clienteNombre} · ${cita.servicioNombre}, ahora ${this.#cuando(cita)}`,
      url: `/equipo?fecha=${cita.fecha}`,
    });
  }

  async cancelada(cita, actorId, { porCliente = false } = {}) {
    const { admins, profesionalUsuarioId } = await this.#equipo(cita);
    if (!porCliente) {
      await this.#enviar([cita.clienteId], actorId, {
        tipo: 'cita_cancelada',
        titulo: 'Tu cita fue cancelada',
        cuerpo: `El salón canceló tu cita de ${cita.servicioNombre} del ${this.#cuando(cita).replace(/^el /, '')} Puedes reservar otra cuando quieras.`,
        url: '/reservar',
      });
    }
    const aviso = {
      tipo: 'cita_cancelada',
      titulo: porCliente ? 'Una clienta canceló' : 'Cita cancelada',
      cuerpo: `${cita.clienteNombre} · ${cita.servicioNombre}, ${this.#cuando(cita)} El horario quedó libre.`,
    };
    if (porCliente) await this.#enviar(admins, actorId, { ...aviso, url: `/admin?fecha=${cita.fecha}` });
    await this.#enviar([profesionalUsuarioId], actorId, { ...aviso, url: `/equipo?fecha=${cita.fecha}` });
  }

  /** Tras una cita completada se invita a la clienta a opinar. */
  async completada(cita, actorId) {
    await this.#enviar([cita.clienteId], actorId, {
      tipo: 'opinion',
      titulo: '¿Cómo te fue hoy?',
      cuerpo: `Gracias por venir. Cuéntanos qué te pareció tu ${cita.servicioNombre}: nos ayuda muchísimo.`,
      url: '/mis-turnos',
    });
  }

  /** Recordatorio que la dueña o la profesional envía a mano desde la agenda. */
  /** Devuelve null si ya se envió uno hace menos de 10 minutos. */
  async recordatorioManual(cita) {
    if (!(await this.repo.reclamarRecordatorioManual(cita.id, 10))) return null;
    return this.notif.notificar(
      [cita.clienteId],
      {
        tipo: 'recordatorio',
        titulo: 'Te esperamos',
        cuerpo: `Recuerda tu cita de ${cita.servicioNombre} con ${cita.profesionalNombre}, ${this.#cuando(cita)}`,
        url: '/mis-turnos',
      },
      // El recordatorio manual lo decide el salón: llega aunque haya apagado los automáticos.
      { categoria: 'cita' },
    );
  }

  async nuevaOpinion({ nombre, calificacion }) {
    const admins = await this.repo.idsAdministradoras();
    await this.notif.notificar(admins, {
      tipo: 'opinion_nueva',
      titulo: `Nueva opinión · ${'★'.repeat(calificacion)}`,
      cuerpo: `${nombre} dejó su opinión sobre el salón.`,
      url: '/admin/opiniones',
    });
  }
}

/** Para las pruebas y para cuando no se quieren avisos: no hace nada. */
export const avisosNulos = {
  reservada: async () => {},
  reprogramada: async () => {},
  cancelada: async () => {},
  completada: async () => {},
  recordatorioManual: async () => ({ destinatarios: 1, dispositivos: 0 }),
  nuevaOpinion: async () => {},
};
