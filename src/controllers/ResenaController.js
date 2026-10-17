import { nombrePublico } from '../services/SitioService.js';

const publica = (r) =>
  r && {
    id: r.id,
    calificacion: r.calificacion,
    comentario: r.comentario,
    visible: r.visible,
    respuesta: r.respuesta,
    creadoEn: r.creadoEn,
    actualizadoEn: r.actualizadoEn,
    nombrePublico: nombrePublico(r.nombre),
  };

/** Capa HTTP de las reseñas: la clienta opina y la administradora modera. */
export class ResenaController {
  constructor({ resenaService }) {
    this.resenas = resenaService;
  }

  // GET /api/resenas/mia
  mia = async (req, res) => {
    const { puedeOpinar, resena } = await this.resenas.mia(req.auth.usuarioId);
    res.json({ puedeOpinar, resena: publica(resena) });
  };

  // PUT /api/resenas/mia
  guardar = async (req, res) => {
    res.json({ resena: publica(await this.resenas.guardar(req.auth.usuarioId, req.body)) });
  };

  // DELETE /api/resenas/mia
  eliminar = async (req, res) => {
    await this.resenas.eliminar(req.auth.usuarioId);
    res.status(204).end();
  };

  // GET /api/admin/resenas
  listar = async (req, res) => {
    const lista = await this.resenas.listar();
    res.json({ resenas: lista.map((r) => ({ ...publica(r), cliente: { nombre: r.nombre, email: r.email } })) });
  };

  // PATCH /api/admin/resenas/:id
  moderar = async (req, res) => {
    const r = await this.resenas.moderar(req.valido.params.id, req.body);
    res.json({ resena: { ...publica(r), cliente: { nombre: r.nombre, email: r.email } } });
  };
}
