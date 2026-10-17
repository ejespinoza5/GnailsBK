/** Capa HTTP de las promociones que envía o programa la dueña. */
export class CampanaController {
  constructor({ campanaService }) {
    this.campanas = campanaService;
  }

  // GET /api/admin/campanas
  listar = async (req, res) => {
    const [campanas, audiencia] = await Promise.all([this.campanas.listar(), this.campanas.audiencia()]);
    res.json({ campanas, audiencia });
  };

  // POST /api/admin/campanas
  crear = async (req, res) => {
    res.status(201).json({ campana: await this.campanas.crear(req.auth.usuarioId, req.body) });
  };

  // PATCH /api/admin/campanas/:id/cancelar
  cancelar = async (req, res) => {
    res.json({ campana: await this.campanas.cancelar(req.valido.params.id) });
  };
}
