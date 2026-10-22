import { Router } from 'express';
import { limitePruebaPush } from '../middlewares/seguridad.js';
import { validar } from '../middlewares/validar.js';
import { esquemaDispositivo, esquemaLeer, esquemaPreferencias } from '../validators/notificaciones.validator.js';

/** La bandeja y las preferencias de quien tiene la sesión (clienta, profesional o dueña). */
export function crearNotificacionesRoutes({ notificacionController: c, requiereSesion }) {
  const router = Router();
  router.use(requiereSesion);
  router.get('/', c.bandeja);
  router.post('/leer', validar(esquemaLeer), c.leer);
  router.post('/dispositivos', validar(esquemaDispositivo), c.registrarDispositivo);
  router.delete('/dispositivos', validar(esquemaDispositivo), c.quitarDispositivo);
  router.post('/prueba', limitePruebaPush, c.probar);
  router.get('/preferencias', c.preferencias);
  router.put('/preferencias', validar(esquemaPreferencias), c.guardarPreferencias);
  return router;
}
