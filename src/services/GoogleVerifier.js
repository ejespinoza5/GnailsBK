import { OAuth2Client } from 'google-auth-library';
import { NoAutenticadoError } from '../errors/AppError.js';

/**
 * Responsabilidad única: validar el ID token que entrega Google y devolver
 * un perfil limpio. Aísla a la app de la librería de Google.
 */
export class GoogleVerifier {
  constructor({ clientId }) {
    this.clientId = clientId;
    this.cliente = new OAuth2Client(clientId);
  }

  /** @returns {Promise<{ googleId: string, email: string, nombre: string, avatarUrl: string | null }>} */
  async verificar(credential) {
    let payload;
    try {
      // Verifica firma de Google, expiración y que el token fue emitido para NUESTRA app.
      const ticket = await this.cliente.verifyIdToken({ idToken: credential, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new NoAutenticadoError('No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new NoAutenticadoError('Tu correo de Google no está verificado');
    }

    const email = payload.email.toLowerCase();
    return {
      googleId: payload.sub,
      email,
      nombre: (payload.name || email.split('@')[0]).slice(0, 100),
      avatarUrl: payload.picture ?? null,
    };
  }
}
