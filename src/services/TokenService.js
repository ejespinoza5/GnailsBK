import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify, errors } from 'jose';
import { NoAutenticadoError, TokenExpiradoError } from '../errors/AppError.js';

/**
 * Responsabilidad única: crear y verificar tokens.
 *  - Access token: JWT firmado con HS256, de vida corta.
 *  - Refresh token: valor aleatorio de 256 bits (no es JWT, se valida contra la BDD).
 */
export class TokenService {
  constructor({ secreto, accessMinutos, refreshDias, emisor = 'geovys-nails-api', audiencia = 'geovys-nails-app' }) {
    this.secreto = new TextEncoder().encode(secreto);
    this.accessMinutos = accessMinutos;
    this.emisor = emisor;
    this.audiencia = audiencia;
    this.accessMs = accessMinutos * 60 * 1000;
    this.refreshMs = refreshDias * 24 * 60 * 60 * 1000;
  }

  firmarAccess({ usuarioId, rol, sesionId }) {
    return new SignJWT({ rol, sid: sesionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(usuarioId)
      .setIssuer(this.emisor)
      .setAudience(this.audiencia)
      .setIssuedAt()
      .setExpirationTime(`${this.accessMinutos}m`)
      .sign(this.secreto);
  }

  /** @returns {Promise<{ usuarioId: string, rol: string, sesionId: string }>} */
  async verificarAccess(token) {
    try {
      const { payload } = await jwtVerify(token, this.secreto, {
        algorithms: ['HS256'], // solo HS256: bloquea "alg: none" y cambios de algoritmo
        issuer: this.emisor,
        audience: this.audiencia,
      });
      return { usuarioId: payload.sub, rol: payload.rol, sesionId: payload.sid };
    } catch (err) {
      if (err instanceof errors.JWTExpired) throw new TokenExpiradoError();
      throw new NoAutenticadoError();
    }
  }

  generarRefresh() {
    return randomBytes(32).toString('base64url');
  }

  /** En la BDD solo se guarda el hash del refresh token. */
  hashRefresh(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  expiracionRefresh() {
    return new Date(Date.now() + this.refreshMs);
  }
}
