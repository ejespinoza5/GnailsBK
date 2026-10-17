import { createHash, randomBytes } from 'node:crypto';
import { ValidacionError } from '../errors/AppError.js';

const ENLACE_INVALIDO = 'El enlace no es válido o ya venció. Pide uno nuevo.';

/**
 * Responsabilidad única: recuperar el acceso con un enlace por correo.
 * - El token es aleatorio (256 bits); en la BDD solo queda su hash.
 * - Dura poco, sirve una vez y al usarlo se cierran todas las sesiones.
 * - Pedirlo responde igual exista o no el correo (no revela quién tiene cuenta).
 */
export class RecuperacionService {
  constructor({ usuarioRepo, recuperacionRepo, hasher, sesionService, correoService, minutos = 30, logger = console }) {
    this.usuarioRepo = usuarioRepo;
    this.recuperacionRepo = recuperacionRepo;
    this.hasher = hasher;
    this.sesiones = sesionService;
    this.correo = correoService;
    this.minutos = minutos;
    this.logger = logger;
  }

  /** Nunca lanza: los errores se registran para no dar pistas a quien pregunta. */
  async solicitar(email, ip) {
    try {
      const usuario = await this.usuarioRepo.buscarPorEmail(email);
      if (!usuario?.activo) return;
      // Un correo por minuto como máximo para la misma cuenta.
      if (await this.recuperacionRepo.hayReciente(usuario.id, 60)) return;

      if (!usuario.passwordHash) {
        // Cuenta de Google: no hay contraseña que recuperar; se le explica cómo entrar.
        // Se registra la solicitud (con un token inservible) solo para aplicar el límite por minuto.
        await this.recuperacionRepo.crear({ usuarioId: usuario.id, tokenHash: hash(randomBytes(32)), minutos: 0, ip });
        await this.correo.enviarCuentaGoogle(usuario);
        return;
      }

      const token = randomBytes(32).toString('base64url');
      await this.recuperacionRepo.invalidarDeUsuario(usuario.id);
      await this.recuperacionRepo.crear({ usuarioId: usuario.id, tokenHash: hash(token), minutos: this.minutos, ip });
      await this.correo.enviarRecuperacion(usuario, token, this.minutos);
    } catch (err) {
      this.logger.error('Recuperación de contraseña:', err);
    }
  }

  async restablecer(token, password) {
    const tokenHash = hash(token);
    const usuarioId = await this.recuperacionRepo.buscarVigente(tokenHash);
    const usuario = usuarioId && (await this.usuarioRepo.buscarPorId(usuarioId));
    if (!usuario?.activo || !usuario.passwordHash) throw new ValidacionError({ token: ENLACE_INVALIDO }, ENLACE_INVALIDO);

    // Se valida antes de gastar el enlace: si la contraseña no sirve, puede intentar otra.
    validarNoContieneCorreo(password, usuario.email);
    // consumir() es atómico: si dos peticiones llegan a la vez, solo una lo usa.
    if ((await this.recuperacionRepo.consumir(tokenHash)) !== usuario.id) {
      throw new ValidacionError({ token: ENLACE_INVALIDO }, ENLACE_INVALIDO);
    }

    await this.usuarioRepo.actualizarPassword(usuario.id, await this.hasher.hash(password));
    await this.recuperacionRepo.invalidarDeUsuario(usuario.id);
    await this.sesiones.cerrarTodas(usuario.id);
    this.correo.enviarPasswordCambiada(usuario).catch((e) => this.logger.error('Aviso de contraseña:', e));
  }

  limpiarVencidas() {
    return this.recuperacionRepo.eliminarVencidas();
  }
}

const hash = (v) => createHash('sha256').update(v).digest('hex');

export function validarNoContieneCorreo(password, email, campo = 'password') {
  const usuarioCorreo = email.split('@')[0].toLowerCase();
  if (usuarioCorreo.length >= 4 && password.toLowerCase().includes(usuarioCorreo)) {
    throw new ValidacionError({ [campo]: 'La contraseña no puede contener tu correo' });
  }
}
