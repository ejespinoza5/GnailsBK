import { Router } from 'express';
import { validar } from '../middlewares/validar.js';
import multer from 'multer';
import {
  limiteCodigos,
  limiteLogin,
  limiteRecuperacion,
  limiteRefresh,
  limiteRegistro,
  limiteSubidas,
  limiteVerificar,
} from '../middlewares/seguridad.js';
import {
  esquemaRegistro,
  esquemaLogin,
  esquemaGoogle,
  esquemaOlvide,
  esquemaRestablecer,
  esquemaPerfil,
  esquemaCambioPassword,
  esquemaCodigo,
} from '../validators/auth.validator.js';

// La foto se recibe en memoria (máx. 5 MB) y sharp la procesa: nunca se escribe al disco tal cual llegó.
const subirFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
}).single('foto');

/**
 * @param {object} deps
 * @param {import('../controllers/AuthController.js').AuthController} deps.authController
 * @param {Function} deps.requiereSesion
 */
export function crearAuthRoutes({ authController: c, cuentaController: cuenta, verificacionController: verif, requiereSesion }) {
  const router = Router();

  router.post('/registro', limiteRegistro, validar(esquemaRegistro), c.registro);
  router.post('/login', limiteLogin, validar(esquemaLogin), c.login);
  router.post('/google', limiteLogin, validar(esquemaGoogle), c.google);
  router.post('/refresh', limiteRefresh, c.refresh);
  router.get('/sesion', limiteRefresh, c.sesion);
  router.get('/me', requiereSesion, c.me);
  router.post('/logout', c.logout);
  router.post('/logout-todas', requiereSesion, c.logoutTodas);

  // Verificación del correo con código
  router.get('/verificacion', requiereSesion, verif.estado);
  router.post('/verificacion', requiereSesion, limiteVerificar, validar(esquemaCodigo), verif.verificar);
  router.post('/verificacion/reenviar', requiereSesion, limiteCodigos, verif.reenviar);

  // Recuperación de contraseña
  router.post('/olvide', limiteRecuperacion, validar(esquemaOlvide), cuenta.olvide);
  router.post('/restablecer', limiteLogin, validar(esquemaRestablecer), cuenta.restablecer);

  // Mi cuenta
  router.patch('/perfil', requiereSesion, validar(esquemaPerfil), cuenta.actualizarPerfil);
  router.put('/password', requiereSesion, limiteLogin, validar(esquemaCambioPassword), cuenta.cambiarPassword);
  router.post('/avatar', requiereSesion, limiteSubidas, subirFoto, cuenta.subirAvatar);
  router.delete('/avatar', requiereSesion, cuenta.eliminarAvatar);

  return router;
}
