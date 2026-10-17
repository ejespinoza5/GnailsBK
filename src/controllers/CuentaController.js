import { usuarioAPublico } from '../mappers/usuario.mapper.js';

const RESPUESTA_OLVIDE =
  'Si hay una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.';

/** Capa HTTP de la cuenta propia y de la recuperación de contraseña. */
export class CuentaController {
  constructor({ cuentaService, recuperacionService, cookies }) {
    this.cuenta = cuentaService;
    this.recuperacion = recuperacionService;
    this.cookies = cookies;
  }

  // POST /api/auth/olvide
  olvide = async (req, res) => {
    // No se espera al envío: así la respuesta tarda lo mismo exista o no el correo.
    this.recuperacion.solicitar(req.body.email, req.ip);
    res.json({ mensaje: RESPUESTA_OLVIDE });
  };

  // POST /api/auth/restablecer
  restablecer = async (req, res) => {
    await this.recuperacion.restablecer(req.body.token, req.body.password);
    this.cookies.borrar(res); // si había una sesión abierta en este navegador, también se cierra
    res.json({ mensaje: 'Listo. Ya puedes iniciar sesión con tu nueva contraseña.' });
  };

  // PATCH /api/auth/perfil
  actualizarPerfil = async (req, res) => {
    const usuario = await this.cuenta.actualizarPerfil(req.auth.usuarioId, req.body);
    res.json({ usuario: usuarioAPublico(usuario) });
  };

  // PUT /api/auth/password
  cambiarPassword = async (req, res) => {
    await this.cuenta.cambiarPassword(req.auth.usuarioId, req.auth.sesionId, req.body);
    res.json({ mensaje: 'Contraseña actualizada. Cerramos tu sesión en los demás dispositivos.' });
  };

  // POST /api/auth/avatar (multipart, campo "foto")
  subirAvatar = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Elige una foto', campos: { foto: 'Elige una foto' } });
    const usuario = await this.cuenta.subirAvatar(req.auth.usuarioId, req.file.buffer);
    res.json({ usuario: usuarioAPublico(usuario) });
  };

  // DELETE /api/auth/avatar
  eliminarAvatar = async (req, res) => {
    const usuario = await this.cuenta.eliminarAvatar(req.auth.usuarioId);
    res.json({ usuario: usuarioAPublico(usuario) });
  };

  // GET /api/avatares/:id
  avatar = async (req, res) => {
    const { imagen, tipo } = await this.cuenta.obtenerAvatar(req.auth, req.valido.params.id);
    res.set({
      'Content-Type': tipo,
      // La URL cambia (?v=) con cada foto nueva, así que se puede guardar en caché.
      'Cache-Control': 'private, max-age=604800, immutable',
      'Content-Disposition': 'inline',
    });
    res.send(imagen);
  };
}
