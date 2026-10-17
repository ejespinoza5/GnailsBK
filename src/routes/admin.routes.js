import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import { subirFotoSitio } from '../http/subidas.js';
import { esquemaCampana } from '../validators/notificaciones.validator.js';
import {
  esquemaFotoGaleria,
  esquemaModerarResena,
  esquemaOrdenGaleria,
  esquemaResolverMapa,
  esquemaTextosSitio,
  esquemaUbicacion,
} from '../validators/sitio.validator.js';
import {
  esquemaAcceso,
  esquemaBloqueo,
  esquemaConfiguracion,
  esquemaHorario,
  esquemaParamId,
  esquemaProfesional,
  esquemaRangoBloqueos,
  esquemaServicio,
} from '../validators/citas.validator.js';

/** Rutas de la administradora. Todas exigen sesión con rol "admin". */
export function crearAdminRoutes({
  servicioController: servicios,
  profesionalController: profesionales,
  agendaController: agenda,
  sitioController: sitio,
  resenaController: resenas,
  campanaController: campanas,
  requiereRol,
}) {
  const router = Router();
  router.use(requiereRol('admin'));

  const conId = validar(esquemaParamId, 'params');

  router.get('/servicios', servicios.listar);
  router.post('/servicios', validar(esquemaServicio), servicios.crear);
  router.put('/servicios/:id', conId, validar(esquemaServicio), servicios.actualizar);
  router.delete('/servicios/:id', conId, servicios.eliminar);

  router.get('/profesionales', profesionales.listar);
  router.post('/profesionales', validar(esquemaProfesional), profesionales.crear);
  router.put('/profesionales/:id', conId, validar(esquemaProfesional), profesionales.actualizar);
  router.delete('/profesionales/:id', conId, profesionales.eliminar);

  router.get('/horario', agenda.obtenerHorario);
  router.put('/horario', validar(esquemaHorario), agenda.guardarHorario);
  router.get('/bloqueos', validar(esquemaRangoBloqueos, 'query'), agenda.listarBloqueos);
  router.post('/bloqueos', validar(esquemaBloqueo), agenda.crearBloqueo);
  router.delete('/bloqueos/:id', conId, agenda.eliminarBloqueo);
  router.get('/configuracion', agenda.obtenerConfiguracion);
  router.put('/configuracion', validar(esquemaConfiguracion), agenda.guardarConfiguracion);

  // Acceso de las profesionales a la app
  router.post('/profesionales/:id/acceso', conId, validar(esquemaAcceso), profesionales.darAcceso);
  router.delete('/profesionales/:id/acceso', conId, profesionales.quitarAcceso);

  // Página pública
  router.get('/sitio', sitio.contenido);
  router.get('/sitio/fotos/:id', conId, sitio.fotoAdmin);
  router.put('/sitio/textos', validar(esquemaTextosSitio), sitio.guardarTextos);
  router.put('/sitio/ubicacion', validar(esquemaUbicacion), sitio.guardarUbicacion);
  router.post('/sitio/resolver-mapa', validar(esquemaResolverMapa), sitio.resolverMapa);
  router.post('/sitio/portada', subirFotoSitio, sitio.subirPortada);
  router.delete('/sitio/portada', sitio.quitarPortada);
  router.post('/sitio/galeria', subirFotoSitio, sitio.subirFoto);
  router.put('/sitio/galeria/orden', validar(esquemaOrdenGaleria), sitio.ordenar);
  router.patch('/sitio/galeria/:id', conId, validar(esquemaFotoGaleria), sitio.actualizarFoto);
  router.delete('/sitio/galeria/:id', conId, sitio.eliminarFoto);

  // Promociones y avisos a las clientas
  router.get('/campanas', campanas.listar);
  router.post('/campanas', validar(esquemaCampana), campanas.crear);
  router.patch('/campanas/:id/cancelar', conId, campanas.cancelar);

  // Reseñas
  router.get('/resenas', resenas.listar);
  router.patch('/resenas/:id', conId, validar(esquemaModerarResena), resenas.moderar);

  return router;
}
