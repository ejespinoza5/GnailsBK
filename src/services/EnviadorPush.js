import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const LOTE = 500; // máximo de tokens por envío que acepta FCM
const TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Responsabilidad única: entregar notificaciones push con Firebase Cloud Messaging.
 * Sin credenciales (desarrollo) no envía nada: lo registra en la consola.
 * El service worker de la app los muestra con el diseño de la marca. Además va la parte "notification":
 * iPhone (Safari) entrega con más seguridad los avisos que traen título y texto visibles.
 */
export class EnviadorPush {
  constructor({ credenciales, appUrl, logger = console }) {
    this.appUrl = appUrl;
    this.logger = logger;
    this.mensajeria = credenciales ? getMessaging(initializeApp({ credential: cert(credenciales) }, 'geovys-nails')) : null;
  }

  get activo() {
    return Boolean(this.mensajeria);
  }

  /** @returns {Promise<{ entregados: number, invalidos: string[] }>} */
  async enviar(tokens, { titulo, cuerpo, url = '/', tipo = 'general' }) {
    if (!tokens.length) return { entregados: 0, invalidos: [] };
    if (!this.mensajeria) {
      this.logger.log(`📲 [dev] push «${titulo}» a ${tokens.length} dispositivo(s)`);
      return { entregados: tokens.length, invalidos: [] };
    }

    let entregados = 0;
    const invalidos = [];
    for (let i = 0; i < tokens.length; i += LOTE) {
      const lote = tokens.slice(i, i + LOTE);
      const r = await this.mensajeria.sendEachForMulticast({
        tokens: lote,
        data: { titulo, cuerpo, url, tipo },
        webpush: {
          notification: { title: titulo, body: cuerpo, icon: `${this.appUrl}/iconos/icono-192.png` },
          // Urgente y con vencimiento: un recordatorio de "5 minutos" no sirve una hora después.
          headers: { Urgency: 'high', TTL: tipo === 'recordatorio' ? '900' : '86400' },
          fcmOptions: { link: `${this.appUrl}${url}` },
        },
      });
      entregados += r.successCount;
      r.responses.forEach((res, j) => {
        if (res.success) return;
        if (TOKEN_INVALIDO.has(res.error?.code)) invalidos.push(lote[j]);
        // Sin el token (es un dato sensible): solo el motivo, para saber por qué no llegó.
        else this.logger.error(`Push no entregada: ${res.error?.code} ${res.error?.message ?? ''}`);
      });
    }
    return { entregados, invalidos };
  }
}
