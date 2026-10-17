import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Responsabilidad única: cifrar y verificar contraseñas.
 * Si algún día se cambia a argon2/bcrypt, solo se reemplaza esta clase.
 */
export class PasswordHasher {
  // Parámetros recomendados por OWASP para scrypt (N=2^17, r=8, p=1).
  constructor({ N = 2 ** 17, r = 8, p = 1, largoClave = 64 } = {}) {
    this.opciones = { N, r, p, maxmem: 256 * 1024 * 1024 };
    this.largoClave = largoClave;
    this.hashFicticio = null;
  }

  #normalizar(password) {
    return password.normalize('NFKC');
  }

  /** Devuelve "scrypt$N$r$p$salt$hash" (salt y hash en base64). */
  async hash(password) {
    const salt = randomBytes(16);
    const hash = await scryptAsync(this.#normalizar(password), salt, this.largoClave, this.opciones);
    const { N, r, p } = this.opciones;
    return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
  }

  async verificar(password, almacenado) {
    const partes = almacenado.split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

    const [, N, r, p, saltB64, hashB64] = partes;
    const esperado = Buffer.from(hashB64, 'base64');
    const calculado = await scryptAsync(this.#normalizar(password), Buffer.from(saltB64, 'base64'), esperado.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: this.opciones.maxmem,
    });

    // Comparación en tiempo constante para no filtrar información por tiempos.
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  }

  /**
   * Ejecuta scrypt aunque el correo no exista: la respuesta tarda lo mismo
   * y no se puede adivinar qué correos están registrados.
   */
  async verificarFicticio(password) {
    this.hashFicticio ??= await this.hash('password-ficticio-para-igualar-tiempos');
    await this.verificar(password, this.hashFicticio);
    return false;
  }
}
