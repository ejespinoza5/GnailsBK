import { NoEncontradoError } from '../errors/AppError.js';

/** Responsabilidad única: cuándo atiende el local (horario, días cerrados y reglas de reserva). */
export class AgendaService {
  constructor({ agendaRepo, citaRepo, profesionalRepo, servicioRepo }) {
    this.agendaRepo = agendaRepo;
    this.citaRepo = citaRepo;
    this.profesionalRepo = profesionalRepo;
    this.servicioRepo = servicioRepo;
  }

  /**
   * Lo que necesita la agenda del equipo para dibujarse y para agendar.
   * La dueña ve a todas; una profesional, solo a sí misma, sus servicios y sus ausencias.
   */
  async contextoEquipo(alcance, { desde, hasta }) {
    const [profesionales, servicios, horario, bloqueos] = await Promise.all([
      this.profesionalRepo.listar(),
      this.servicioRepo.listar(),
      this.agendaRepo.obtenerHorario(),
      this.agendaRepo.listarBloqueos({ desde, hasta }),
    ]);
    const propia = alcance.rol === 'profesional';
    const yo = propia ? profesionales.find((p) => p.id === alcance.profesionalId) : null;
    const visibles = propia ? [yo] : profesionales;

    return {
      rol: alcance.rol,
      profesionalId: alcance.profesionalId,
      // Solo los datos que la agenda usa (la cuenta vinculada no se expone aquí)
      profesionales: visibles.map(({ cuenta, ...p }) => p),
      servicios: servicios.filter((s) => s.activo && (!propia || yo.servicios.includes(s.id))),
      horario,
      bloqueos: bloqueos.filter((b) => !propia || !b.profesionalId || b.profesionalId === alcance.profesionalId),
    };
  }

  obtenerHorario() {
    return this.agendaRepo.obtenerHorario();
  }

  guardarHorario(dias) {
    return this.agendaRepo.guardarHorario(dias);
  }

  listarBloqueos(rango) {
    return this.agendaRepo.listarBloqueos(rango);
  }

  /** Devuelve también cuántas citas confirmadas quedan afectadas, para avisarle a la administradora. */
  async crearBloqueo(datos) {
    if (datos.profesionalId && !(await this.profesionalRepo.buscarPorId(datos.profesionalId))) {
      throw new NoEncontradoError('No encontramos a esta profesional');
    }
    const bloqueo = await this.agendaRepo.crearBloqueo(datos);

    const citas = await this.citaRepo.listar({
      desde: datos.fecha,
      hasta: datos.fecha,
      profesionalId: datos.profesionalId,
      estado: 'confirmada',
    });
    return { bloqueo, citasAfectadas: citas.length };
  }

  async eliminarBloqueo(id) {
    if (!(await this.agendaRepo.eliminarBloqueo(id))) throw new NoEncontradoError('No encontramos este bloqueo');
  }

  obtenerConfiguracion() {
    return this.agendaRepo.obtenerConfiguracion();
  }

  guardarConfiguracion(datos) {
    return this.agendaRepo.guardarConfiguracion(datos);
  }
}
