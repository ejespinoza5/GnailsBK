/** Tablas "sitio" (datos de la página) y "fotos_sitio" (portada y galería). Solo SQL parametrizado. */

const num = (v) => (v === null || v === undefined ? null : Number(v));

function filaASitio(f) {
  return {
    heroTitulo: f.hero_titulo,
    heroSubtitulo: f.hero_subtitulo,
    direccion: f.direccion,
    referencia: f.referencia,
    latitud: num(f.latitud),
    longitud: num(f.longitud),
    mapsUrl: f.maps_url,
    whatsapp: f.whatsapp,
    instagram: f.instagram,
    facebook: f.facebook,
    tiktok: f.tiktok ?? null,
  };
}

function filaAFoto(f) {
  return {
    id: f.id,
    tipo: f.tipo,
    titulo: f.titulo,
    ancho: f.ancho,
    alto: f.alto,
    orden: f.orden,
    visible: f.visible,
    // La URL cambia cuando cambia la foto: el navegador puede guardarla en caché para siempre.
    version: new Date(f.actualizado_en).getTime().toString(36),
  };
}

const COLUMNAS_FOTO = 'id, tipo, titulo, ancho, alto, orden, visible, actualizado_en';

export class SitioRepository {
  constructor(db) {
    this.db = db;
  }

  async obtener() {
    const { rows } = await this.db.query(`SELECT * FROM sitio WHERE id = 1`);
    return filaASitio(rows[0]);
  }

  async guardarTextos({ heroTitulo, heroSubtitulo }) {
    const { rows } = await this.db.query(
      `UPDATE sitio SET hero_titulo = $1, hero_subtitulo = $2 WHERE id = 1 RETURNING *`,
      [heroTitulo, heroSubtitulo],
    );
    return filaASitio(rows[0]);
  }

  async guardarUbicacion(d) {
    const { rows } = await this.db.query(
      `UPDATE sitio
          SET direccion = $1, referencia = $2, latitud = $3, longitud = $4, maps_url = $5,
              whatsapp = $6, instagram = $7, facebook = $8, tiktok = $9
        WHERE id = 1
        RETURNING *`,
      [d.direccion, d.referencia, d.latitud, d.longitud, d.mapsUrl, d.whatsapp, d.instagram, d.facebook, d.tiktok],
    );
    return filaASitio(rows[0]);
  }

  // ---------- Fotos

  async listarFotos(tipo, { soloVisibles = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS_FOTO} FROM fotos_sitio
        WHERE tipo = $1 AND ($2::boolean = FALSE OR visible)
        ORDER BY orden, creado_en`,
      [tipo, soloVisibles],
    );
    return rows.map(filaAFoto);
  }

  async contarGaleria() {
    const { rows } = await this.db.query(`SELECT COUNT(*)::int AS n FROM fotos_sitio WHERE tipo = 'galeria'`);
    return rows[0].n;
  }

  async agregarFoto({ tipo, imagen, miniatura, ancho, alto, titulo }) {
    const { rows } = await this.db.query(
      `INSERT INTO fotos_sitio (tipo, imagen, miniatura, ancho, alto, titulo, orden)
       VALUES ($1::varchar, $2, $3, $4, $5, $6,
               COALESCE((SELECT MAX(orden) + 1 FROM fotos_sitio WHERE tipo = $1::varchar), 0))
       RETURNING ${COLUMNAS_FOTO}`,
      [tipo, imagen, miniatura, ancho, alto, titulo],
    );
    return filaAFoto(rows[0]);
  }

  /** La portada es una sola: se reemplaza en una sentencia. */
  async reemplazarPortada({ imagen, miniatura, ancho, alto }) {
    const { rows } = await this.db.query(
      `INSERT INTO fotos_sitio (tipo, imagen, miniatura, ancho, alto)
       VALUES ('portada', $1, $2, $3, $4)
       ON CONFLICT (tipo) WHERE tipo = 'portada' DO UPDATE
          SET imagen = EXCLUDED.imagen, miniatura = EXCLUDED.miniatura,
              ancho = EXCLUDED.ancho, alto = EXCLUDED.alto
       RETURNING ${COLUMNAS_FOTO}`,
      [imagen, miniatura, ancho, alto],
    );
    return filaAFoto(rows[0]);
  }

  async actualizarFoto(id, { titulo, visible }) {
    const { rows } = await this.db.query(
      `UPDATE fotos_sitio SET titulo = $2, visible = $3 WHERE id = $1 AND tipo = 'galeria' RETURNING ${COLUMNAS_FOTO}`,
      [id, titulo, visible],
    );
    return rows[0] ? filaAFoto(rows[0]) : null;
  }

  /** Guarda el orden de la galería en una sola sentencia (posición = índice en la lista). */
  async ordenarGaleria(ids) {
    await this.db.query(
      `UPDATE fotos_sitio f SET orden = o.pos
         FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, pos)
        WHERE f.id = o.id AND f.tipo = 'galeria'`,
      [ids],
    );
  }

  async eliminarFoto(id, tipo) {
    const { rowCount } = await this.db.query(`DELETE FROM fotos_sitio WHERE id = $1 AND tipo = $2`, [id, tipo]);
    return rowCount > 0;
  }

  /** Los bytes de la imagen (grande o miniatura) para servirla. */
  async obtenerArchivo(id, { miniatura = false, incluirOcultas = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${miniatura ? 'miniatura' : 'imagen'} AS datos FROM fotos_sitio
        WHERE id = $1 AND ($2::boolean OR visible)`,
      [id, incluirOcultas],
    );
    return rows[0]?.datos ?? null;
  }
}
