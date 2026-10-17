import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import { limiteReservas } from '../middlewares/seguridad.js';
import { esquemaResena } from '../validators/sitio.validator.js';

/** La reseña propia de la clienta (con sesión y correo verificado). */
export function crearResenasRoutes({ resenaController: c, requiereSesion, requiereEmailVerificado }) {
  const router = Router();
  const sesion = [requiereSesion, requiereEmailVerificado];
  router.get('/mia', sesion, c.mia);
  router.put('/mia', sesion, limiteReservas, validar(esquemaResena), c.guardar);
  router.delete('/mia', sesion, c.eliminar);
  return router;
}
