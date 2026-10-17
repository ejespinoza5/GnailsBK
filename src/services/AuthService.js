import {
  ConflictoError,
  DemasiadosIntentosError,
  NoAutenticadoError,
  ProhibidoError,
} from '../errors/AppError.js';

const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

/**
 * Responsabilidad única: verificar la IDENTIDAD de una persona
 * (registro, login con contraseña, login con Google, perfil).
 * No crea sesiones ni toca cookies: eso es de SesionService y del controlador.
 */
export class AuthService {
  /**
   * @param {object} deps
   * @param {import('../repositories/UsuarioRepository.js').UsuarioRepository} deps.usuarioRepo
   * @param {import('./PasswordHasher.js').PasswordHasher} deps.hasher
   * @param {import('./GoogleVerifier.js').GoogleVerifier} deps.googleVerifier
   * @param {{ maxIntentos: number, minutosBloqueo: number }} [deps.politicaBloqueo]
   */
  constructor({ usuarioRepo, hasher, googleVerifier, politicaBloqueo = { maxIntentos: 5, minutosBloqueo: 15 } }) {
    this.usuarioRepo = usuarioRepo;
    this.hasher = hasher;
    this.google = googleVerifier;
    this.politicaBloqueo = politicaBloqueo;
  }

  async registrar({ nombre, email, password }) {
    const existente = await this.usuarioRepo.buscarPorEmail(email);
    if (existente) {
      const mensaje = existente.passwordHash
        ? 'Este correo ya está registrado'
        : 'Este correo ya está registrado con Google. Usa el botón «Continuar con Google».';
      throw new ConflictoError(mensaje, { email: mensaje });
    }
    const passwordHash = await this.hasher.hash(password);
    const usuario = await this.usuarioRepo.crear({ nombre, email, passwordHash });
    await this.usuarioRepo.registrarAccesoExitoso(usuario.id);
    return usuario;
  }

  async login({ email, password }) {
    const usuario = await this.usuarioRepo.buscarPorEmail(email);

    // Mismo mensaje y mismo tiempo de respuesta exista o no el correo.
    if (!usuario || !usuario.passwordHash || !usuario.activo) {
      await this.hasher.verificarFicticio(password);
      throw new NoAutenticadoError(CREDENCIALES_INVALIDAS);
    }

    await this.#verificarBloqueo(usuario);

    if (!(await this.hasher.verificar(password, usuario.passwordHash))) {
      await this.usuarioRepo.registrarIntentoFallido(usuario.id, this.politicaBloqueo);
      throw new NoAutenticadoError(CREDENCIALES_INVALIDAS);
    }

    await this.usuarioRepo.registrarAccesoExitoso(usuario.id);
    return usuario;
  }

  /** Sirve tanto para registrarse como para iniciar sesión con Google. */
  async loginGoogle(credential) {
    const perfil = await this.google.verificar(credential);

    let usuario = await this.usuarioRepo.buscarPorGoogleId(perfil.googleId);
    usuario ??= await this.#crearConGoogle(perfil);

    if (!usuario.activo) throw new ProhibidoError('Esta cuenta está desactivada');

    await this.usuarioRepo.registrarAccesoExitoso(usuario.id);
    return usuario;
  }

  async obtenerPerfil(usuarioId) {
    const usuario = await this.usuarioRepo.buscarPorId(usuarioId);
    if (!usuario?.activo) throw new NoAutenticadoError();
    return usuario;
  }

  /**
   * Cada cuenta entra con UN método. Si el correo ya existe (registrado con
   * contraseña o con otra cuenta de Google), no se entra ni se vincula: así
   * nadie toma una cuenta ajena solo por tener un Google con ese correo.
   */
  async #crearConGoogle({ googleId, email, nombre, avatarUrl }) {
    const existente = await this.usuarioRepo.buscarPorEmail(email);

    if (existente?.passwordHash) {
      throw new ConflictoError(
        'Este correo ya está registrado con contraseña. Inicia sesión con tu correo y contraseña.',
        undefined,
        'CUENTA_CON_PASSWORD',
      );
    }
    if (existente) {
      throw new ConflictoError('Este correo ya está vinculado a otra cuenta de Google.');
    }

    return this.usuarioRepo.crear({ nombre, email, googleId, avatarUrl, emailVerificado: true });
  }

  async #verificarBloqueo(usuario) {
    if (!usuario.bloqueadoHasta) return;

    const restanteMs = new Date(usuario.bloqueadoHasta).getTime() - Date.now();
    if (restanteMs > 0) {
      const minutos = Math.ceil(restanteMs / 60_000);
      throw new DemasiadosIntentosError(
        `Cuenta bloqueada temporalmente por varios intentos fallidos. Inténtalo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
      );
    }
    await this.usuarioRepo.reiniciarIntentos(usuario.id);
  }
}
