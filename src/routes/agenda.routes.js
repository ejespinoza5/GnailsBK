import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import { limiteAgendaEquipo } from '../middlewares/seguridad.js';
import {
  esquemaAgendar,
  esquemaBuscarClientas,
  esquemaDisponibilidadAdmin,
  esquemaEstadoCita,
  esquemaFiltroCitas,
  esquemaParamId,
  esquemaRangoAgenda,
  esquemaReprogramar,
} from '../validators/citas.validator.js';

/** Agenda del equipo: la dueña y las profesionales con acceso (cada una solo lo suyo). */
export function crearAgendaRoutes({ agendaEquipoController: c, requiereEquipo }) {
  const router = Router();
  router.use(requiereEquipo);
  const conId = validar(esquemaParamId, 'params');

  router.get('/contexto', validar(esquemaRangoAgenda, 'query'), c.contexto);
  router.get('/citas', validar(esquemaFiltroCitas, 'query'), c.listar);
  router.post('/citas', limiteAgendaEquipo, validar(esquemaAgendar), c.agendar);
  router.patch('/citas/:id/estado', conId, validar(esquemaEstadoCita), c.cambiarEstado);
  router.patch('/citas/:id/reprogramar', conId, validar(esquemaReprogramar), c.reprogramar);
  router.delete('/citas/:id', conId, c.eliminar);
  router.post('/citas/:id/recordatorio', conId, c.recordatorio);
  router.get('/disponibilidad', validar(esquemaDisponibilidadAdmin, 'query'), c.disponibilidad);
  router.get('/clientas', validar(esquemaBuscarClientas, 'query'), c.buscarClientas);

  return router;
}
