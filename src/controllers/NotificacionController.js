/** Capa HTTP de la bandeja de avisos, las push del dispositivo y las preferencias. */
export class NotificacionController {
  constructor({ notificacionService }) {
    this.notif = notificacionService;
  }

  // GET /api/notificaciones
  bandeja = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await this.notif.bandeja(req.auth.usuarioId));
  };

  // POST /api/notificaciones/leer  { ids? }  (sin ids: todas)
  leer = async (req, res) => {
    await this.notif.marcarLeidas(req.auth.usuarioId, req.body.ids);
    res.status(204).end();
  };

  // POST /api/notificaciones/dispositivos  { token }
  registrarDispositivo = async (req, res) => {
    await this.notif.registrarDispositivo(req.auth.usuarioId, req.body.token, req.get('user-agent'));
    res.status(204).end();
  };

  // DELETE /api/notificaciones/dispositivos  { token }
  quitarDispositivo = async (req, res) => {
    await this.notif.quitarDispositivo(req.auth.usuarioId, req.body.token);
    res.status(204).end();
  };

  // POST /api/notificaciones/prueba
  probar = async (req, res) => {
    res.json(await this.notif.probar(req.auth.usuarioId));
  };

  // GET /api/notificaciones/preferencias
  preferencias = async (req, res) => {
    res.json({ preferencias: await this.notif.preferencias(req.auth.usuarioId), pushServidor: this.notif.pushActivo });
  };

  // PUT /api/notificaciones/preferencias
  guardarPreferencias = async (req, res) => {
    res.json({ preferencias: await this.notif.guardarPreferencias(req.auth.usuarioId, req.body) });
  };
}
