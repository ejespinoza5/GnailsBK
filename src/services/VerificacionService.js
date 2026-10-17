import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError, DemasiadosIntentosError, ValidacionError } from '../errors/AppError.js';

/**
 * Responsabilidad única: comprobar que la persona es dueña del correo con que
 * se registró, mediante un código de 6 dígitos enviado por correo.
 * - Vence en 15 minutos y solo hay un código vigente por persona.
 * - En la BDD se guarda un HMAC del código (con un secreto del servidor).
 * - Máximo 5 intentos por código; para reenviar hay que esperar 60 s.
 */
export class VerificacionService {
  constructor({
    usuarioRepo,
    verificacionRepo,
    correoService,
    secreto,
    minutos = 15,
    maxIntentos = 5,
    esperaReenvio = 60,
    logger = console,
  }) {
    this.usuarioRepo = usuarioRepo;
    this.verificacionRepo = verificacionRepo;
    this.correo = correoService;
    // Clave propia derivada del secreto: el mismo valor no sirve para otra cosa.
    this.clave = createHmac('sha256', secreto).update('verificacion-email').digest();
    this.minutos = minutos;
    this.maxIntentos = maxIntentos;
    this.esperaReenvio = esperaReenvio;
    this.logger = logger;
  }

  #hash(codigo) {
    return createHmac('sha256', this.clave).update(codigo).digest('hex');
  }

  /** Genera un código nuevo y lo envía. `forzar` omite la espera (justo después de registrarse). */
  async enviarCodigo(usuario, { forzar = false } = {}) {
    if (usuario.emailVerificado) throw new AppError('Tu correo ya está verificado', 409, { codigo: 'YA_VERIFICADO' });

    const actual = await this.verificacionRepo.obtener(usuario.id);
    if (!forzar && actual && actual.segundosDesde < this.esperaReenvio) {
      const faltan = this.esperaReenvio - actual.segundosDesde;
      throw new DemasiadosIntentosError(`Espera ${faltan} segundos para pedir otro código.`);
    }

    // randomInt usa el generador criptográfico: el código no se puede predecir.
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.verificacionRepo.guardar({ usuarioId: usuario.id, codigoHash: this.#hash(codigo), minutos: this.minutos });
    this.correo
      .enviarCodigoVerificacion(usuario, codigo, this.minutos)
      .catch((e) => this.logger.error('Correo de verificación:', e));

    return this.estado(usuario.id);
  }

  /** Para la pantalla: cuándo vence el código y en cuántos segundos se puede pedir otro. */
  async estado(usuarioId) {
    const v = await this.verificacionRepo.obtener(usuarioId);
    if (!v) return { expiraEn: null, reenviarEnSegundos: 0, intentosRestantes: 0 };
    const vigente = new Date(v.expiraEn) > new Date() && v.intentos < this.maxIntentos;
    return {
      expiraEn: vigente ? v.expiraEn : null,
      reenviarEnSegundos: Math.max(0, this.esperaReenvio - v.segundosDesde),
      intentosRestantes: vigente ? this.maxIntentos - v.intentos : 0,
    };
  }

  async verificar(usuarioId, codigo) {
    const usuario = await this.usuarioRepo.buscarPorId(usuarioId);
    if (usuario.emailVerificado) return usuario;

    const intento = await this.verificacionRepo.usarIntento(usuarioId, this.maxIntentos);
    if (!intento) {
      throw new ValidacionError(
        { codigo: 'El código venció o ya no tiene intentos. Pide uno nuevo.' },
        'El código venció o ya no tiene intentos. Pide uno nuevo.',
      );
    }

    const esperado = Buffer.from(intento.codigoHash, 'hex');
    const recibido = Buffer.from(this.#hash(codigo), 'hex');
    if (!timingSafeEqual(esperado, recibido)) {
      const quedan = this.maxIntentos - intento.intentos;
      const mensaje = quedan
        ? `Código incorrecto. Te queda${quedan === 1 ? '' : 'n'} ${quedan} intento${quedan === 1 ? '' : 's'}.`
        : 'Código incorrecto. Ya no quedan intentos: pide un código nuevo.';
      throw new ValidacionError({ codigo: mensaje }, mensaje);
    }

    const verificado = await this.usuarioRepo.marcarEmailVerificado(usuarioId);
    await this.verificacionRepo.eliminar(usuarioId);
    return verificado;
  }

  limpiarVencidos() {
    return this.verificacionRepo.eliminarVencidas();
  }
}
