/**
 * Plantilla HTML de los correos con el diseño de la app: cabecera espresso con
 * el logo dorado, tarjeta blanca sobre marfil y botón dorado.
 * Hecha con tablas y estilos en línea porque Gmail, Outlook y Apple Mail
 * ignoran casi todo el CSS moderno. El logo va adjunto (cid:logo).
 */

const C = {
  espresso: '#1d1814',
  crema: '#fbf8f3',
  blanco: '#ffffff',
  tinta: '#2a2420',
  suave: '#6b625a',
  oro: '#87672a',
  oroClaro: '#c9a35a',
  linea: '#e3d3b1',
  velo: '#f5ecdb',
};

const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "Raleway, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Escapa texto para HTML: los nombres los escribe la persona y no deben inyectar etiquetas. */
export function escapar(texto = '') {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {object} o
 * @param {string} o.asunto          también se usa como texto de vista previa
 * @param {string} o.titulo
 * @param {string[]} o.parrafos      HTML ya escapado
 * @param {{ texto: string, url: string }} [o.boton]
 * @param {string} [o.nota]          aviso pequeño bajo el botón (HTML escapado)
 * @param {string} [o.vistaPrevia]
 * @param {string} [o.codigo]        código grande y espaciado (verificación)
 */
export function plantillaCorreo({ titulo, parrafos, boton, nota, codigo, vistaPrevia = '' }) {
  const p = (html) =>
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.tinta};">${html}</p>`;

  const botonHtml = boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
        <tr><td align="center" bgcolor="${C.oro}" style="border-radius:999px;">
          <a href="${escapar(boton.url)}" target="_blank"
             style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:16px;font-weight:600;letter-spacing:0.03em;color:${C.blanco};text-decoration:none;border-radius:999px;">
            ${escapar(boton.texto)}
          </a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.suave};">
        ¿El botón no funciona? Copia este enlace en tu navegador:<br>
        <a href="${escapar(boton.url)}" style="color:${C.oro};word-break:break-all;">${escapar(boton.url)}</a>
      </p>`
    : '';

  const codigoHtml = codigo
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
        <tr><td align="center" bgcolor="${C.velo}" style="padding:22px 12px;border:1px solid ${C.linea};border-radius:16px;">
          <div style="font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.oro};margin-bottom:8px;">Tu código</div>
          <div style="font-family:${SERIF};font-size:42px;line-height:1;font-weight:normal;letter-spacing:0.32em;color:${C.tinta};padding-left:0.32em;">${escapar(codigo)}</div>
        </td></tr>
      </table>`
    : '';

  const notaHtml = nota
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
        <tr><td style="padding:14px 18px;background:${C.velo};border-radius:12px;font-family:${SANS};font-size:14px;line-height:1.5;color:#5f4818;">
          ${nota}
        </td></tr>
      </table>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapar(titulo)}</title>
<style>
  @media (max-width: 480px) {
    .cuerpo { padding: 30px 22px 28px !important; }
    .titulo { font-size: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.crema};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.crema};">${escapar(vistaPrevia)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.crema}">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

      <tr><td align="center" bgcolor="${C.espresso}" style="padding:34px 24px 30px;border-radius:20px 20px 0 0;">
        <img src="cid:logo" width="220" height="53" alt="Geovys Nails · Geovanna Espinoza"
             style="display:block;width:220px;height:auto;border:0;color:${C.oroClaro};font-family:${SERIF};font-size:24px;">
      </td></tr>

      <tr><td class="cuerpo" bgcolor="${C.blanco}" style="padding:40px 40px 36px;border:1px solid ${C.linea};border-top:0;border-radius:0 0 20px 20px;">
        <h1 class="titulo" style="margin:0 0 20px;font-family:${SERIF};font-size:32px;line-height:1.15;font-weight:normal;color:${C.tinta};">${escapar(titulo)}</h1>
        ${parrafos.map(p).join('\n')}
        ${codigoHtml}
        ${botonHtml}
        ${notaHtml}
      </td></tr>

      <tr><td align="center" style="padding:24px 16px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.suave};">
        Geovys Nails · Geovanna Espinoza<br>
        Recibes este correo porque tienes una cuenta en nuestro sistema de reservas.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
