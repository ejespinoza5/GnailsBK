/** Tabla "verificaciones_email": un código vigente por persona. Solo SQL parametrizado. */
export class VerificacionRepository {
  constructor(db) {
    this.db = db;
  }

  /** Crea o reemplaza el código de la persona (reinicia los intentos). */
  async guardar({ usuarioId, codigoHash, minutos }) {
    await this.db.query(
      `INSERT INTO verificaciones_email (usuario_id, codigo_hash, expira_en, intentos, creado_en)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), 0, NOW())
       ON CONFLICT (usuario_id) DO UPDATE
          SET codigo_hash = EXCLUDED.codigo_hash,
              expira_en = EXCLUDED.expira_en,
              intentos = 0,
              creado_en = NOW()`,
      [usuarioId, codigoHash, minutos],
    );
  }

  async obtener(usuarioId) {
    const { rows } = await this.db.query(
      `SELECT expira_en, intentos, creado_en,
              EXTRACT(EPOCH FROM (NOW() - creado_en))::int AS segundos_desde
         FROM verificaciones_email WHERE usuario_id = $1`,
      [usuarioId],
    );
    const f = rows[0];
    return f ? { expiraEn: f.expira_en, intentos: f.intentos, segundosDesde: f.segundos_desde } : null;
  }

  /**
   * Gasta un intento ANTES de comparar el código, en una sola sentencia:
   * aunque lleguen muchas peticiones a la vez, nadie prueba más de `max` códigos.
   * Devuelve null si no hay código vigente o ya no le quedan intentos.
   */
  async usarIntento(usuarioId, max) {
    const { rows } = await this.db.query(
      `UPDATE verificaciones_email
          SET intentos = intentos + 1
        WHERE usuario_id = $1 AND intentos < $2 AND expira_en > NOW()
        RETURNING codigo_hash, intentos`,
      [usuarioId, max],
    );
    return rows[0] ? { codigoHash: rows[0].codigo_hash, intentos: rows[0].intentos } : null;
  }

  async eliminar(usuarioId) {
    await this.db.query(`DELETE FROM verificaciones_email WHERE usuario_id = $1`, [usuarioId]);
  }

  async eliminarVencidas() {
    await this.db.query(`DELETE FROM verificaciones_email WHERE expira_en < NOW() - INTERVAL '1 day'`);
  }
}
