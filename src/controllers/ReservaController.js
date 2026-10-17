import { citaAPublico, profesionalAPublico, servicioAPublico } from '../mappers/citas.mapper.js';

/** Capa HTTP de la clienta: catálogo, disponibilidad y sus citas. */
export class ReservaController {
  constructor({ servicioService, profesionalService, disponibilidadService, citaService }) {
    this.servicioService = servicioService;
    this.profesionalService = profesionalService;
    this.disponibilidadService = disponibilidadService;
    this.citaService = citaService;
  }

  // GET /api/servicios
  listarServicios = async (req, res) => {
    const servicios = await this.servicioService.listarReservables();
    res.json({ servicios: servicios.map(servicioAPublico) });
  };

  // GET /api/servicios/:id/profesionales
  profesionalesDeServicio = async (req, res) => {
    const profesionales = await this.profesionalService.listarPorServicio(req.valido.params.id);
    res.json({ profesionales: profesionales.map(profesionalAPublico) });
  };

  // GET /api/disponibilidad?servicioId&profesionalId&desde&dias
  disponibilidad = async (req, res) => {
    const r = await this.disponibilidadService.calcular(req.valido.query);
    res.json({
      intervaloMin: r.intervaloMin,
      duracionMin: r.servicio.duracionMin,
      profesionales: r.profesionales.map(profesionalAPublico),
      dias: r.dias.map(({ carga, ...dia }) => dia), // la carga de cada profesional es interna
    });
  };

  // GET /api/citas/mias
  misCitas = async (req, res) => {
    const { citas, horasCancelacion, mensajeReserva } = await this.citaService.misCitas(req.auth.usuarioId);
    res.json({
      horasCancelacion,
      mensajeReserva,
      citas: citas.map((c) => ({ ...citaAPublico(c), cancelable: c.cancelable, pasada: c.pasada })),
    });
  };

  // POST /api/citas
  reservar = async (req, res) => {
    const cita = await this.citaService.reservar(req.auth.usuarioId, req.body);
    const { mensajeReserva } = await this.citaService.reglas();
    res.status(201).json({ cita: citaAPublico(cita), mensajeReserva });
  };

  // PATCH /api/citas/:id/cancelar
  cancelar = async (req, res) => {
    const cita = await this.citaService.cancelarPorCliente(req.auth.usuarioId, req.valido.params.id);
    res.json({ cita: citaAPublico(cita) });
  };
}
