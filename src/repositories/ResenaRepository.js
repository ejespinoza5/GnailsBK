/** Tabla "resenas". Solo SQL parametrizado. */

function filaAResena(f) {
  if (!f) return null;
  return {
    id: f.id,
    usuarioId: f.usuario_id,
    calificacion: f.calificacion,
    comentario: f.comentario,
    visible: f.visible,
    respuesta: f.respuesta,
    respondidaEn: f.respondida_en,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    nombre: f.nombre,
    email: f.email,
  };
}

const SELECT = `
  SELECT r.*, u.nombre, u.email
    FROM resenas r
    JOIN usuarios u ON u.id = r.usuario_id`;

export class ResenaRepository {
  constructor(db) {
    this.db = db;
  }

  async deUsuario(usuarioId) {
    const { rows } = await this.db.query(`${SELECT} WHERE r.usuario_id = $1`, [usuarioId]);
    return filaAResena(rows[0]);
  }

  /** Crea o actualiza la reseña de la clienta (una por persona). */
  async guardar(usuarioId, { calificacion, comentario }) {
    await this.db.query(
      `INSERT INTO resenas (usuario_id, calificacion, comentario)
       VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE
          SET calificacion = EXCLUDED.calificacion, comentario = EXCLUDED.comentario`,
      [usuarioId, calificacion, comentario],
    );
    return this.deUsuario(usuarioId);
  }

  async eliminarDeUsuario(usuarioId) {
    await this.db.query(`DELETE FROM resenas WHERE usuario_id = $1`, [usuarioId]);
  }

  async publicas(limite = 30) {
    const { rows } = await this.db.query(
      `${SELECT} WHERE r.visible ORDER BY r.creado_en DESC LIMIT $1`,
      [limite],
    );
    return rows.map(filaAResena);
  }

  async resumenPublico() {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(calificacion), 0)::float AS promedio,
              COUNT(*) FILTER (WHERE calificacion = 5)::int AS cinco
         FROM resenas WHERE visible`,
    );
    return rows[0];
  }

  async todas() {
    const { rows } = await this.db.query(`${SELECT} ORDER BY r.creado_en DESC LIMIT 500`);
    return rows.map(filaAResena);
  }

  async moderar(id, { visible, respuesta }) {
    const { rows } = await this.db.query(
      `UPDATE resenas
          SET visible = $2,
              respuesta = $3,
              respondida_en = CASE
                  WHEN $3::varchar IS NULL THEN NULL
                  WHEN respuesta IS DISTINCT FROM $3::varchar THEN NOW()
                  ELSE respondida_en
              END
        WHERE id = $1
        RETURNING id`,
      [id, visible, respuesta],
    );
    if (!rows[0]) return null;
    const r = await this.db.query(`${SELECT} WHERE r.id = $1`, [id]);
    return filaAResena(r.rows[0]);
  }

  /** ¿Tiene al menos una cita completada? (solo quien fue atendida puede opinar) */
  async tieneCitaCompletada(usuarioId) {
    const { rows } = await this.db.query(
      `SELECT EXISTS (SELECT 1 FROM citas WHERE cliente_id = $1 AND estado = 'completada') AS si`,
      [usuarioId],
    );
    return rows[0].si;
  }
}
