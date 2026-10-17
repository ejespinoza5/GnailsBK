import { DemasiadosIntentosError, NoEncontradoError, ProhibidoError, ReglaNegocioError, ValidacionError } from '../errors/AppError.js';
import { validarNoContieneCorreo } from './RecuperacionService.js';

/** Responsabilidad única: que cada persona administre su propia cuenta (perfil, contraseña, foto). */
export class CuentaService {
  constructor({ usuarioRepo, avatarRepo, sesionRepo, hasher, procesadorImagen, correoService, logger = console }) {
    this.usuarioRepo = usuarioRepo;
    this.avatarRepo = avatarRepo;
    this.sesionRepo = sesionRepo;
    this.hasher = hasher;
    this.imagenes = procesadorImagen;
    this.correo = correoService;
    this.logger = logger;
  }

  actualizarPerfil(usuarioId, datos) {
    return this.usuarioRepo.actualizarPerfil(usuarioId, datos);
  }

  /** Cambia la contraseña y cierra las demás sesiones (la actual sigue abierta). */
  async cambiarPassword(usuarioId, sesionId, { actual, nueva }) {
    const usuario = await this.usuarioRepo.buscarPorId(usuarioId);
    if (!usuario.passwordHash) {
      throw new ReglaNegocioError('Tu cuenta entra con Google y no usa contraseña.');
    }
    if (usuario.bloqueadoHasta && new Date(usuario.bloqueadoHasta) > new Date()) {
      throw new DemasiadosIntentosError('Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.');
    }
    if (!(await this.hasher.verificar(actual, usuario.passwordHash))) {
      await this.usuarioRepo.registrarIntentoFallido(usuario.id, { maxIntentos: 5, minutosBloqueo: 15 });
      throw new ValidacionError({ actual: 'La contraseña actual no es correcta' });
    }
    if (actual === nueva) throw new ValidacionError({ nueva: 'La nueva contraseña debe ser distinta de la actual' });
    validarNoContieneCorreo(nueva, usuario.email, 'nueva');

    await this.usuarioRepo.actualizarPassword(usuario.id, await this.hasher.hash(nueva));
    await this.sesionRepo.eliminarDeUsuarioExcepto(usuario.id, sesionId);
    this.correo.enviarPasswordCambiada(usuario).catch((e) => this.logger.error('Aviso de contraseña:', e));
  }

  async subirAvatar(usuarioId, buffer) {
    const imagen = await this.imagenes.avatar(buffer);
    await this.avatarRepo.guardar(usuarioId, imagen);
    // ?v= cambia con cada foto: el navegador no muestra la anterior desde su caché.
    return this.usuarioRepo.actualizarAvatarUrl(usuarioId, `/api/avatares/${usuarioId}?v=${Date.now().toString(36)}`);
  }

  async eliminarAvatar(usuarioId) {
    await this.avatarRepo.eliminar(usuarioId);
    return this.usuarioRepo.actualizarAvatarUrl(usuarioId, null);
  }

  /** Cada quien ve su foto; la administradora ve la de todas. */
  async obtenerAvatar(solicitante, usuarioId) {
    if (solicitante.usuarioId !== usuarioId && solicitante.rol !== 'admin') throw new ProhibidoError();
    const avatar = await this.avatarRepo.obtener(usuarioId);
    if (!avatar) throw new NoEncontradoError('Sin foto');
    return avatar;
  }
}
