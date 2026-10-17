import { ValidacionError } from '../errors/AppError.js';

// Solo se siguen enlaces de Google Maps: el servidor nunca visita otras direcciones (evita SSRF).
const HOSTS_PERMITIDOS = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+)$/i;
const MAX_SALTOS = 5;

const ENLACE_INVALIDO = 'Pega un enlace de Google Maps (por ejemplo https://maps.app.goo.gl/…).';

/**
 * Responsabilidad única: sacar latitud y longitud de un enlace de Google Maps.
 * Los enlaces cortos (maps.app.goo.gl) redirigen a la URL larga, que trae las coordenadas.
 */
export class EnlaceMapas {
  constructor({ fetch: fetchFn = globalThis.fetch, timeoutMs = 6000 } = {}) {
    this.fetch = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  async resolver(enlace) {
    let url = this.#validar(enlace);

    let coords = extraerCoordenadas(url);
    for (let salto = 0; !coords && salto < MAX_SALTOS; salto++) {
      const r = await this.fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (GeovysNails)' },
      }).catch(() => null);
      const destino = r?.headers.get('location');
      if (!destino) break;
      url = this.#validar(new URL(destino, url).href);
      coords = extraerCoordenadas(url);
    }

    if (!coords) {
      throw new ValidacionError(
        { mapsUrl: 'No encontramos las coordenadas en ese enlace. Prueba con «Compartir → Copiar enlace» en Google Maps o escribe la latitud y longitud.' },
        'No encontramos las coordenadas en ese enlace',
      );
    }
    return { ...coords, nombre: extraerNombre(url) };
  }

  #validar(texto) {
    let url;
    try {
      url = new URL(String(texto).trim());
    } catch {
      throw new ValidacionError({ mapsUrl: ENLACE_INVALIDO }, ENLACE_INVALIDO);
    }
    if (url.protocol !== 'https:' || !HOSTS_PERMITIDOS.test(url.hostname)) {
      throw new ValidacionError({ mapsUrl: ENLACE_INVALIDO }, ENLACE_INVALIDO);
    }
    return url;
  }
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/** Busca coordenadas en los formatos que usa Google Maps. Exportada para las pruebas. */
export function extraerCoordenadas(url) {
  const texto = decodeURIComponent(url.href).replace(/\+/g, '');
  const patrones = [
    new RegExp(String.raw`!3d${NUM}!4d${NUM}`), // el lugar exacto (prioridad sobre el centro del mapa)
    new RegExp(String.raw`/search/${NUM},\s*${NUM}`),
    new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${NUM},\s*${NUM}`),
    new RegExp(String.raw`@${NUM},${NUM}`),
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) {
      const latitud = Number(m[1]);
      const longitud = Number(m[2]);
      if (Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180) {
        return { latitud: Number(latitud.toFixed(6)), longitud: Number(longitud.toFixed(6)) };
      }
    }
  }
  return null;
}

function extraerNombre(url) {
  const m = decodeURIComponent(url.pathname).match(/\/place\/([^/]+)/);
  return m ? m[1].replace(/\+/g, ' ').slice(0, 200) : null;
}
