import { citaAAdmin, profesionalAPublico } from '../mappers/citas.mapper.js';

/** Capa HTTP de la agenda del equipo. req.alcance dice si es la dueña (todo) o una profesional (solo lo suyo). */
export class AgendaEquipoController {
  constructor({ citaService, agendaService, disponibilidadService, usuarioRepo }) {
    this.citaService = citaService;
    this.agendaService = agendaService;
    this.disponibilidadService = disponibilidadService;
    this.usuarioRepo = usuarioRepo;
  }

  // GET /api/agenda/contexto?desde&hasta
  contexto = async (req, res) => {
    res.json(await this.agendaService.contextoEquipo(req.alcance, req.valido.query));
  };

  // GET /api/agenda/citas?desde&hasta&profesionalId&estado
  listar = async (req, res) => {
    const citas = await this.citaService.listar(req.alcance, req.valido.query);
    res.json({ citas: citas.map(citaAAdmin) });
  };

  // POST /api/agenda/citas
  agendar = async (req, res) => {
    const cita = await this.citaService.agendar(req.alcance, req.body);
    res.status(201).json({ cita: citaAAdmin(cita) });
  };

  // PATCH /api/agenda/citas/:id/estado
  cambiarEstado = async (req, res) => {
    const cita = await this.citaService.cambiarEstado(req.alcance, req.valido.params.id, req.body.estado);
    res.json({ cita: citaAAdmin(cita) });
  };

  // PATCH /api/agenda/citas/:id/reprogramar
  reprogramar = async (req, res) => {
    const cita = await this.citaService.reprogramar(req.alcance, req.valido.params.id, req.body);
    res.json({ cita: citaAAdmin(cita) });
  };

  // DELETE /api/agenda/citas/:id
  eliminar = async (req, res) => {
    await this.citaService.eliminar(req.alcance, req.valido.params.id);
    res.status(204).end();
  };

  // POST /api/agenda/citas/:id/recordatorio
  recordatorio = async (req, res) => {
    const { dispositivos } = await this.citaService.enviarRecordatorio(req.alcance, req.valido.params.id);
    res.json({
      dispositivos,
      mensaje: dispositivos
        ? 'Recordatorio enviado: le llegó como notificación.'
        : 'Recordatorio enviado a su bandeja. No tiene las notificaciones activadas en su celular, lo verá al entrar a la app.',
    });
  };

  // GET /api/agenda/disponibilidad: sin límites de anticipación; una profesional solo ve la suya
  disponibilidad = async (req, res) => {
    const q = req.valido.query;
    const profesionalId = req.alcance.rol === 'profesional' ? req.alcance.profesionalId : q.profesionalId;
    const r = await this.disponibilidadService.calcular({ ...q, profesionalId, modoAdmin: true });
    res.json({
      intervaloMin: r.intervaloMin,
      duracionMin: r.servicio.duracionMin,
      profesionales: r.profesionales.map(profesionalAPublico),
      dias: r.dias.map(({ carga, ...dia }) => dia),
    });
  };

  // GET /api/agenda/clientas?q=
  buscarClientas = async (req, res) => {
    const lista = await this.usuarioRepo.buscarClientas(req.valido.query.q);
    res.json({ clientas: lista.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono })) });
  };
}
