/** Capa HTTP de la administradora: catálogo de servicios. */
export class ServicioController {
  constructor({ servicioService }) {
    this.servicioService = servicioService;
  }

  // GET /api/admin/servicios
  listar = async (req, res) => {
    res.json({ servicios: await this.servicioService.listar() });
  };

  // POST /api/admin/servicios
  crear = async (req, res) => {
    res.status(201).json({ servicio: await this.servicioService.crear(req.body) });
  };

  // PUT /api/admin/servicios/:id
  actualizar = async (req, res) => {
    res.json({ servicio: await this.servicioService.actualizar(req.valido.params.id, req.body) });
  };

  // DELETE /api/admin/servicios/:id
  eliminar = async (req, res) => {
    await this.servicioService.eliminar(req.valido.params.id);
    res.status(204).end();
  };
}
