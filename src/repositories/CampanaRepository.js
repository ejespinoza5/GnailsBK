/** Tabla "campanas": promociones y avisos que la dueña envía o programa. */
function filaACampana(f) {
  return {
    id: f.id,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    url: f.url,
    programadaPara: f.programada_para,
    estado: f.estado,
    destinatarios: f.destinatarios,
    enviadaEn: f.enviada_en,
    creadoEn: f.creado_en,
  };
}

export class CampanaRepository {
  constructor(db) {
    this.db = db;
  }

  /** fecha y hora vienen en la hora local del salón; AT TIME ZONE las convierte al instante real. */
  async crear({ titulo, cuerpo, url, fecha, hora, zonaHoraria, ahora = false, creadaPor }) {
    const { rows } = await this.db.query(
      `INSERT INTO campanas (titulo, cuerpo, url, programada_para, creada_por)
       VALUES ($1, $2, $3,
               CASE WHEN $4::boolean THEN NOW() ELSE ($5::date + $6::time) AT TIME ZONE $7 END,
               $8)
       RETURNING *`,
      [titulo, cuerpo, url, ahora, fecha, hora, zonaHoraria, creadaPor],
    );
    return filaACampana(rows[0]);
  }

  async listar() {
    const { rows } = await this.db.query(`SELECT * FROM campanas ORDER BY programada_para DESC LIMIT 100`);
    return rows.map(filaACampana);
  }

  async cancelar(id) {
    const { rows } = await this.db.query(
      `UPDATE campanas SET estado = 'cancelada' WHERE id = $1 AND estado = 'programada' RETURNING *`,
      [id],
    );
    return rows[0] ? filaACampana(rows[0]) : null;
  }

  /**
   * Toma las campañas cuya hora llegó, marcándolas "enviando" en la misma sentencia:
   * aunque haya dos servidores revisando a la vez, cada campaña se envía una sola vez.
   */
  async reclamarPendientes() {
    const { rows } = await this.db.query(
      `UPDATE campanas SET estado = 'enviando'
        WHERE id IN (SELECT id FROM campanas WHERE estado = 'programada' AND programada_para <= NOW()
                      ORDER BY programada_para LIMIT 10 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
    );
    return rows.map(filaACampana);
  }

  async marcarEnviada(id, destinatarios) {
    await this.db.query(
      `UPDATE campanas SET estado = 'enviada', destinatarios = $2, enviada_en = NOW() WHERE id = $1`,
      [id, destinatarios],
    );
  }

  async enFuturo(fecha, hora, zonaHoraria) {
    const { rows } = await this.db.query(
      `SELECT ($1::date + $2::time) AT TIME ZONE $3 > NOW() - INTERVAL '1 minute' AS ok,
              ($1::date + $2::time) AT TIME ZONE $3 < NOW() + INTERVAL '90 days' AS cerca`,
      [fecha, hora, zonaHoraria],
    );
    return rows[0];
  }
}
