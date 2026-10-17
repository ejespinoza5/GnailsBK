/** Capa HTTP de la administradora: horario, días cerrados y reglas de reserva. */
export class AgendaController {
  constructor({ agendaService }) {
    this.agendaService = agendaService;
  }

  // GET /api/admin/horario
  obtenerHorario = async (req, res) => {
    res.json({ dias: await this.agendaService.obtenerHorario() });
  };

  // PUT /api/admin/horario
  guardarHorario = async (req, res) => {
    res.json({ dias: await this.agendaService.guardarHorario(req.body.dias) });
  };

  // GET /api/admin/bloqueos?desde&hasta
  listarBloqueos = async (req, res) => {
    res.json({ bloqueos: await this.agendaService.listarBloqueos(req.valido.query) });
  };

  // POST /api/admin/bloqueos
  crearBloqueo = async (req, res) => {
    res.status(201).json(await this.agendaService.crearBloqueo(req.body));
  };

  // DELETE /api/admin/bloqueos/:id
  eliminarBloqueo = async (req, res) => {
    await this.agendaService.eliminarBloqueo(req.valido.params.id);
    res.status(204).end();
  };

  // GET /api/admin/configuracion
  obtenerConfiguracion = async (req, res) => {
    res.json({ configuracion: await this.agendaService.obtenerConfiguracion() });
  };

  // PUT /api/admin/configuracion
  guardarConfiguracion = async (req, res) => {
    res.json({ configuracion: await this.agendaService.guardarConfiguracion(req.body) });
  };
}
