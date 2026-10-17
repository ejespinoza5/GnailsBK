import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import { esquemaParamId } from '../validators/citas.validator.js';

/** Rutas públicas de la landing: no requieren sesión. */
export function crearPublicoRoutes({ sitioController: c }) {
  const router = Router();
  router.get('/landing', c.landing);
  router.get('/fotos/:id', validar(esquemaParamId, 'params'), c.foto);
  return router;
}
