/** Capa HTTP de la administradora: equipo de profesionales. */
export class ProfesionalController {
  constructor({ profesionalService }) {
    this.profesionalService = profesionalService;
  }

  // GET /api/admin/profesionales
  listar = async (req, res) => {
    res.json({ profesionales: await this.profesionalService.listar() });
  };

  // POST /api/admin/profesionales
  crear = async (req, res) => {
    res.status(201).json({ profesional: await this.profesionalService.crear(req.body) });
  };

  // PUT /api/admin/profesionales/:id
  actualizar = async (req, res) => {
    res.json({ profesional: await this.profesionalService.actualizar(req.valido.params.id, req.body) });
  };

  // POST /api/admin/profesionales/:id/acceso
  darAcceso = async (req, res) => {
    res.json({ profesional: await this.profesionalService.darAcceso(req.valido.params.id, req.body.email) });
  };

  // DELETE /api/admin/profesionales/:id/acceso
  quitarAcceso = async (req, res) => {
    res.json({ profesional: await this.profesionalService.quitarAcceso(req.valido.params.id) });
  };

  // DELETE /api/admin/profesionales/:id
  eliminar = async (req, res) => {
    await this.profesionalService.eliminar(req.valido.params.id);
    res.status(204).end();
  };
}
