import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { escapar, plantillaCorreo } from '../correo/plantilla.js';

const LOGO = fileURLToPath(new URL('../correo/logo-correo.png', import.meta.url));
const CARPETA_DEV = fileURLToPath(new URL('../../correos-dev/', import.meta.url));

/**
 * Responsabilidad única: redactar y enviar los correos de la app.
 * Sin SMTP (solo en desarrollo) guarda cada correo como .html en server/correos-dev/
 * para revisar el diseño sin enviar nada.
 */
export class CorreoService {
  /**
   * @param {object} deps
   * @param {object|null} deps.smtp      opciones de nodemailer o null
   * @param {string} deps.remitente
   * @param {string} deps.appUrl         URL del frontend para los enlaces
   */
  constructor({ smtp, remitente, appUrl, logger = console }) {
    this.transporte = smtp ? nodemailer.createTransport(smtp) : null;
    this.remitente = remitente;
    this.appUrl = appUrl;
    this.logger = logger;
  }

  /** El token va en el fragmento (#): no viaja al servidor, ni a registros, ni en el Referer. */
  enlaceRecuperacion(token) {
    return `${this.appUrl}/restablecer#token=${encodeURIComponent(token)}`;
  }

  enviarRecuperacion(usuario, token, minutos) {
    const nombre = escapar(usuario.nombre.split(' ')[0]);
    return this.#enviar({
      para: usuario.email,
      asunto: 'Restablece tu contraseña',
      titulo: 'Restablece tu contraseña',
      vistaPrevia: `El enlace vence en ${minutos} minutos.`,
      parrafos: [
        `Hola, ${nombre}:`,
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta en Geovys Nails. Toca el botón para elegir una nueva.',
      ],
      boton: { texto: 'Elegir nueva contraseña', url: this.enlaceRecuperacion(token) },
      nota: `El enlace vence en <strong>${minutos} minutos</strong> y solo funciona una vez. Si no fuiste tú, ignora este correo: tu contraseña no cambiará.`,
    });
  }

  /** Para quien pide recuperar pero entra con Google (no tiene contraseña). */
  enviarCuentaGoogle(usuario) {
    const nombre = escapar(usuario.nombre.split(' ')[0]);
    return this.#enviar({
      para: usuario.email,
      asunto: 'Tu cuenta usa Google',
      titulo: 'Tu cuenta usa Google',
      vistaPrevia: 'No necesitas contraseña para entrar.',
      parrafos: [
        `Hola, ${nombre}:`,
        'Pediste recuperar tu contraseña, pero tu cuenta de Geovys Nails se creó con Google, así que no tiene una.',
        'Para entrar, usa el botón <strong>«Acceder con Google»</strong> en la página de inicio de sesión.',
      ],
      boton: { texto: 'Ir a iniciar sesión', url: `${this.appUrl}/login` },
      nota: 'Si no fuiste tú, ignora este correo.',
    });
  }

  enviarCodigoVerificacion(usuario, codigo, minutos) {
    const nombre = escapar(usuario.nombre.split(' ')[0]);
    return this.#enviar({
      para: usuario.email,
      // El código en el asunto y en la vista previa: se puede leer sin abrir el correo.
      asunto: `${codigo} es tu código de Geovys Nails`,
      titulo: 'Confirma tu correo',
      vistaPrevia: `Tu código vence en ${minutos} minutos.`,
      parrafos: [
        `Hola, ${nombre}:`,
        '¡Gracias por crear tu cuenta en Geovys Nails! Escribe este código en la app para confirmar tu correo y empezar a reservar.',
      ],
      codigo,
      nota: `El código vence en <strong>${minutos} minutos</strong>. Nunca te lo pediremos por teléfono ni por WhatsApp. Si no creaste esta cuenta, ignora este correo.`,
    });
  }

  /** Aviso de seguridad cada vez que la contraseña cambia. */
  enviarPasswordCambiada(usuario) {
    const nombre = escapar(usuario.nombre.split(' ')[0]);
    return this.#enviar({
      para: usuario.email,
      asunto: 'Tu contraseña fue cambiada',
      titulo: 'Tu contraseña cambió',
      vistaPrevia: 'Si no fuiste tú, recupera tu cuenta ahora.',
      parrafos: [
        `Hola, ${nombre}:`,
        'Te confirmamos que la contraseña de tu cuenta en Geovys Nails se cambió hace un momento. Por seguridad, cerramos tu sesión en los demás dispositivos.',
      ],
      boton: { texto: 'Iniciar sesión', url: `${this.appUrl}/login` },
      nota: '<strong>¿No fuiste tú?</strong> Usa «¿Olvidaste tu contraseña?» en la página de inicio de sesión para elegir una nueva cuanto antes.',
    });
  }

  async #enviar({ para, asunto, ...contenido }) {
    const html = plantillaCorreo(contenido);
    const texto = textoPlano(contenido);

    if (!this.transporte) {
      await mkdir(CARPETA_DEV, { recursive: true });
      const archivo = `${CARPETA_DEV}${Date.now()}-${asunto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.html`;
      // En la vista previa local el logo se carga desde el disco en lugar del adjunto.
      await writeFile(archivo, html.replace('cid:logo', `file:///${LOGO.replaceAll('\\', '/')}`));
      this.logger.log(`✉️  [dev] Correo a ${para}: «${asunto}» → ${archivo}`);
      if (contenido.boton) this.logger.log(`   Enlace: ${contenido.boton.url}`);
      return;
    }

    await this.transporte.sendMail({
      from: this.remitente,
      to: para,
      subject: asunto,
      html,
      text: texto,
      attachments: [{ filename: 'logo.png', path: LOGO, cid: 'logo' }],
    });
  }
}

/** Versión de texto para clientes de correo sin HTML (y para los filtros de spam). */
function textoPlano({ titulo, parrafos, boton, nota, codigo }) {
  const limpiar = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return [titulo, '', ...parrafos.map(limpiar), codigo ? `\nTu código: ${codigo}` : '', boton ? `\n${boton.texto}: ${boton.url}` : '', nota ? `\n${limpiar(nota)}` : '', '\n— Geovys Nails · Geovanna Espinoza']
    .join('\n')
    .trim();
}
