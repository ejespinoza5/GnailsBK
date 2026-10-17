import { ConflictoError, DemasiadosIntentosError, NoEncontradoError, ReglaNegocioError } from '../errors/AppError.js';
import { avisosNulos } from './AvisosCitas.js';
import { aHora, aMinutos, minutosHasta } from '../utils/tiempo.js';

const HORARIO_OCUPADO = 'Ese horario acaba de ocuparse. Elige otro, por favor.';

/** Violación de la restricción EXCLUDE: la profesional ya tiene una cita a esa hora. */
const esSolapamiento = (err) => err?.code === '23P01';

/**
 * Responsabilidad única: el ciclo de vida de una cita
 * (reservar, cancelar, cambiar estado, reprogramar).
 */
export class CitaService {
  constructor({ citaRepo, agendaRepo, usuarioRepo, disponibilidadService, reloj, avisos = avisosNulos, logger = console }) {
    this.citaRepo = citaRepo;
    this.avisos = avisos;
    this.logger = logger;
    this.usuarioRepo = usuarioRepo;
    this.agendaRepo = agendaRepo;
    this.disponibilidad = disponibilidadService;
    this.reloj = reloj;
  }

  // ---------------------------------------------------------- Clienta

  async reservar(clienteId, { servicioId, profesionalId = null, fecha, hora, notas = null }) {
    const config = await this.agendaRepo.obtenerConfiguracion();
    const ahora = this.reloj.ahora();

    const activas = await this.citaRepo.contarActivasFuturas(clienteId, { fecha: ahora.fecha, hora: aHora(ahora.minutos) });
    if (activas >= config.maxCitasActivas) {
      throw new ReglaNegocioError(
        `Ya tienes ${activas} cita${activas === 1 ? '' : 's'} próxima${activas === 1 ? '' : 's'}. ` +
          'Podrás reservar otra cuando pase alguna o si cancelas una.',
        'LIMITE_CITAS',
      );
    }

    const { servicio, slot, dia } = await this.#buscarTurno({ servicioId, profesionalId, fecha, hora });
    const elegida = profesionalId ?? this.#menosOcupada(slot.profesionales, dia.carga);

    try {
      const cita = await this.citaRepo.crear({
        clienteId,
        profesionalId: elegida,
        servicioId,
        fecha,
        horaInicio: hora,
        horaFin: aHora(aMinutos(hora) + servicio.duracionMin),
        precio: servicio.precio,
        precioTipo: servicio.precioTipo,
        precioMax: servicio.precioMax,
        notas,
      });
      this.#avisar('reservada', cita, clienteId);
      return cita;
    } catch (err) {
      if (esSolapamiento(err)) throw new ConflictoError(HORARIO_OCUPADO, undefined, 'HORARIO_OCUPADO');
      throw err;
    }
  }

  /** Reglas que la clienta necesita ver (mensaje al reservar, plazo para cancelar). */
  reglas() {
    return this.agendaRepo.obtenerConfiguracion();
  }

  async misCitas(clienteId) {
    const [citas, config] = await Promise.all([
      this.citaRepo.listarDeCliente(clienteId),
      this.agendaRepo.obtenerConfiguracion(),
    ]);
    const ahora = this.reloj.ahora();
    return {
      horasCancelacion: config.horasCancelacion,
      mensajeReserva: config.mensajeReserva,
      citas: citas.map((c) => ({
        ...c,
        cancelable: c.estado === 'confirmada' && minutosHasta(ahora, c.fecha, c.horaInicio) >= config.horasCancelacion * 60,
        pasada: minutosHasta(ahora, c.fecha, c.horaInicio) < 0,
      })),
    };
  }

  async cancelarPorCliente(clienteId, citaId) {
    const cita = await this.citaRepo.buscarPorId(citaId);
    // Si la cita es de otra persona se responde igual que si no existiera.
    if (!cita || cita.clienteId !== clienteId) throw new NoEncontradoError('No encontramos esta cita');
    if (cita.estado !== 'confirmada') throw new ReglaNegocioError('Esta cita ya no se puede cancelar');

    const { horasCancelacion } = await this.agendaRepo.obtenerConfiguracion();
    if (minutosHasta(this.reloj.ahora(), cita.fecha, cita.horaInicio) < horasCancelacion * 60) {
      throw new ReglaNegocioError(
        `Las citas se pueden cancelar hasta ${horasCancelacion} horas antes. Escríbenos y te ayudamos.`,
        'FUERA_DE_PLAZO',
      );
    }

    const cancelada = await this.citaRepo.cambiarEstado(citaId, {
      estado: 'cancelada',
      canceladaPor: 'cliente',
      estadoActual: 'confirmada',
    });
    if (!cancelada) throw new ReglaNegocioError('Esta cita ya no se puede cancelar');
    this.#avisar('cancelada', cancelada, clienteId, { porCliente: true });
    return cancelada;
  }

  // ---------------------------------------------------------- Equipo (dueña o profesional)
  //
  // `alcance` = { rol: 'admin' | 'profesional', usuarioId, profesionalId }.
  // La dueña gestiona todas las citas; una profesional, solo las suyas: para ella
  // las citas de otras no existen (404) y siempre agenda a su propio nombre.

  listar(alcance, filtros) {
    return this.citaRepo.listar({ ...filtros, profesionalId: this.#profesionalDe(alcance, filtros.profesionalId) });
  }

  /** Agenda una cita desde el salón: para una clienta con cuenta o para alguien sin cuenta (nombre y teléfono). */
  async agendar(alcance, { clienteId = null, clienteNombre = null, clienteTelefono = null, servicioId, profesionalId, fecha, hora, notas = null }) {
    if (clienteId) {
      const cliente = await this.usuarioRepo.buscarPorId(clienteId);
      if (!cliente?.activo) throw new NoEncontradoError('No encontramos a esa clienta');
    }
    const profesional = this.#profesionalDe(alcance, profesionalId);
    // Sin límites de anticipación ni de días hacia adelante, pero sí horario, ausencias y cruces.
    const { servicio } = await this.#buscarTurno({ servicioId, profesionalId: profesional, fecha, hora, modoAdmin: true });

    try {
      const cita = await this.citaRepo.crear({
        clienteId,
        clienteNombre: clienteId ? null : clienteNombre,
        clienteTelefono: clienteId ? null : clienteTelefono,
        creadaPor: alcance.usuarioId,
        profesionalId: profesional,
        servicioId,
        fecha,
        horaInicio: hora,
        horaFin: aHora(aMinutos(hora) + servicio.duracionMin),
        precio: servicio.precio,
        precioTipo: servicio.precioTipo,
        precioMax: servicio.precioMax,
        notas,
      });
      this.#avisar('reservada', cita, alcance.usuarioId);
      return cita;
    } catch (err) {
      if (esSolapamiento(err)) throw new ConflictoError(HORARIO_OCUPADO, undefined, 'HORARIO_OCUPADO');
      throw err;
    }
  }

  async cambiarEstado(alcance, citaId, estado) {
    const cita = await this.#citaDelEquipo(alcance, citaId);
    if (cita.estado === estado) return cita;

    try {
      // "admin" en cancelada_por significa "cancelada por el salón" (dueña o profesional).
      const actualizada = await this.citaRepo.cambiarEstado(citaId, { estado, canceladaPor: 'admin' });
      if (estado === 'cancelada') this.#avisar('cancelada', actualizada, alcance.usuarioId);
      if (estado === 'completada') this.#avisar('completada', actualizada, alcance.usuarioId);
      return actualizada;
    } catch (err) {
      // Reactivar una cita cancelada cuyo horario ya tomó otra persona
      if (esSolapamiento(err)) {
        throw new ConflictoError('Ese horario ya está ocupado por otra cita. Reprográmala a otra hora.');
      }
      throw err;
    }
  }

  async reprogramar(alcance, citaId, { fecha, hora, profesionalId }) {
    const cita = await this.#citaDelEquipo(alcance, citaId);
    if (cita.estado !== 'confirmada') throw new ReglaNegocioError('Solo se pueden reprogramar citas confirmadas');
    const profesional = this.#profesionalDe(alcance, profesionalId);

    const { servicio } = await this.#buscarTurno({
      servicioId: cita.servicioId,
      profesionalId: profesional,
      fecha,
      hora,
      excluirCitaId: citaId,
      modoAdmin: true,
    });

    try {
      const actualizada = await this.citaRepo.reprogramar(citaId, {
        profesionalId: profesional,
        fecha,
        horaInicio: hora,
        horaFin: aHora(aMinutos(hora) + servicio.duracionMin),
      });
      this.#avisar('reprogramada', actualizada, alcance.usuarioId);
      return actualizada;
    } catch (err) {
      if (esSolapamiento(err)) throw new ConflictoError(HORARIO_OCUPADO, undefined, 'HORARIO_OCUPADO');
      throw err;
    }
  }

  /** Borra la cita para siempre (también de "Mis turnos" de la clienta). Para dejar registro, mejor cancelar. */
  async eliminar(alcance, citaId) {
    const cita = await this.#citaDelEquipo(alcance, citaId);
    await this.citaRepo.eliminar(citaId);
    // Si era una cita por venir, para la clienta es una cancelación: se le avisa.
    if (cita.estado === 'confirmada' && minutosHasta(this.reloj.ahora(), cita.fecha, cita.horaInicio) > 0) {
      this.#avisar('cancelada', cita, alcance.usuarioId);
    }
  }

  /** Recordatorio que la dueña o la profesional envía a mano (máximo uno cada 10 minutos por cita). */
  async enviarRecordatorio(alcance, citaId) {
    const cita = await this.#citaDelEquipo(alcance, citaId);
    if (!cita.clienteId) {
      throw new ReglaNegocioError('Esta clienta no tiene cuenta en la app. Escríbele por WhatsApp.', 'SIN_CUENTA');
    }
    if (cita.estado !== 'confirmada' || minutosHasta(this.reloj.ahora(), cita.fecha, cita.horaInicio) <= 0) {
      throw new ReglaNegocioError('Solo se puede recordar una cita confirmada que todavía no empieza.');
    }
    const r = await this.avisos.recordatorioManual(cita);
    if (r === null) throw new DemasiadosIntentosError('Ya le enviaste un recordatorio hace poco. Espera unos minutos.');
    return r;
  }

  /** Los avisos no deben frenar ni romper la operación: se envían aparte y si fallan solo se registra. */
  #avisar(metodo, ...args) {
    Promise.resolve()
      .then(() => this.avisos[metodo](...args))
      .catch((e) => this.logger.error(`Aviso ${metodo}:`, e.message));
  }

  /** La profesional solo actúa sobre sí misma, aunque la petición diga otra cosa. */
  #profesionalDe(alcance, pedida) {
    return alcance.rol === 'profesional' ? alcance.profesionalId : pedida ?? null;
  }

  async #citaDelEquipo(alcance, citaId) {
    const cita = await this.citaRepo.buscarPorId(citaId);
    if (!cita || (alcance.rol === 'profesional' && cita.profesionalId !== alcance.profesionalId)) {
      throw new NoEncontradoError('No encontramos esta cita');
    }
    return cita;
  }

  // ---------------------------------------------------------- Interno

  /** Verifica con las mismas reglas de la disponibilidad que el turno pedido está libre. */
  async #buscarTurno({ servicioId, profesionalId, fecha, hora, excluirCitaId = null, modoAdmin = false }) {
    const { servicio, dias } = await this.disponibilidad.calcular({
      servicioId,
      profesionalId,
      desde: fecha,
      dias: 1,
      excluirCitaId,
      modoAdmin,
    });
    const [dia] = dias;
    if (dia.estado !== 'disponible' && dia.estado !== 'completo') {
      throw new ReglaNegocioError(dia.motivo ?? 'No se puede reservar en esta fecha', 'DIA_NO_DISPONIBLE');
    }

    const slot = dia.horarios.find((h) => h.hora === hora);
    if (!slot) throw new ConflictoError('Ese horario ya no está disponible. Elige otro, por favor.', undefined, 'HORARIO_OCUPADO');

    return { servicio, slot, dia };
  }

  /** Si la clienta elige "cualquiera", se asigna a quien tenga menos trabajo ese día. */
  #menosOcupada(ids, carga = {}) {
    return [...ids].sort((a, b) => (carga[a] ?? 0) - (carga[b] ?? 0))[0];
  }
}
