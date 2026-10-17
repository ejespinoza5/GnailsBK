import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import { limiteReservas } from '../middlewares/seguridad.js';
import {
  esquemaDisponibilidad,
  esquemaParamId,
  esquemaReserva,
} from '../validators/citas.validator.js';

/** Rutas de la clienta. Todas exigen sesión iniciada. */
export function crearReservasRoutes({ reservaController: c, requiereSesion, requiereEmailVerificado }) {
  const router = Router();
  // Para ver y reservar turnos hace falta sesión y el correo verificado.
  const sesion = [requiereSesion, requiereEmailVerificado];
  const conId = validar(esquemaParamId, 'params');

  router.get('/servicios', sesion, c.listarServicios);
  router.get('/servicios/:id/profesionales', sesion, conId, c.profesionalesDeServicio);
  router.get('/disponibilidad', sesion, validar(esquemaDisponibilidad, 'query'), c.disponibilidad);

  router.get('/citas/mias', sesion, c.misCitas);
  router.post('/citas', sesion, limiteReservas, validar(esquemaReserva), c.reservar);
  router.patch('/citas/:id/cancelar', sesion, limiteReservas, conId, c.cancelar);

  return router;
}
