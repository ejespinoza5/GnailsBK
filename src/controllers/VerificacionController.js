import { usuarioAPublico } from '../mappers/usuario.mapper.js';

/** Capa HTTP de la verificación del correo. */
export class VerificacionController {
  constructor({ verificacionService, authService }) {
    this.verificacion = verificacionService;
    this.auth = authService;
  }

  // GET /api/auth/verificacion
  estado = async (req, res) => {
    res.json(await this.verificacion.estado(req.auth.usuarioId));
  };

  // POST /api/auth/verificacion/reenviar
  reenviar = async (req, res) => {
    const usuario = await this.auth.obtenerPerfil(req.auth.usuarioId);
    res.json(await this.verificacion.enviarCodigo(usuario));
  };

  // POST /api/auth/verificacion
  verificar = async (req, res) => {
    const usuario = await this.verificacion.verificar(req.auth.usuarioId, req.body.codigo);
    res.json({ usuario: usuarioAPublico(usuario) });
  };
}
