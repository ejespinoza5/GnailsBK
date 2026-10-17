/**
 * Acceso a datos de la tabla "sesiones" (una fila = un dispositivo con sesión).
 * Solo SQL, sin reglas de negocio.
 */
export class SesionRepository {
  /** @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} db */
  constructor(db) {
    this.db = db;
  }

  async crear({ usuarioId, tokenHash, expiraEn, ip, userAgent }) {
    const { rows } = await this.db.query(
      `INSERT INTO sesiones (usuario_id, token_hash, expira_en, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [usuarioId, tokenHash, expiraEn, ip, userAgent],
    );
    return rows[0].id;
  }

  /**
   * Rotación atómica: reemplaza el token vigente por uno nuevo y extiende la
   * expiración. Al ser un solo UPDATE, el mismo token nunca puede rotarse dos veces.
   * @returns {Promise<{ id: string, usuarioId: string } | null>}
   */
  async rotar({ tokenHashActual, tokenHashNuevo, expiraEn }) {
    const { rows } = await this.db.query(
      `UPDATE sesiones
          SET token_hash_anterior = token_hash,
              token_hash = $2,
              rotado_en = NOW(),
              ultimo_uso = NOW(),
              expira_en = $3
        WHERE token_hash = $1
          AND expira_en > NOW()
        RETURNING id, usuario_id`,
      [tokenHashActual, tokenHashNuevo, expiraEn],
    );
    return rows[0] ? { id: rows[0].id, usuarioId: rows[0].usuario_id } : null;
  }

  /**
   * Busca una sesión cuyo token ANTERIOR (ya reemplazado) coincide.
   * @returns {Promise<{ id: string, usuarioId: string, rotadoEn: Date } | null>}
   */
  async buscarPorTokenAnterior(tokenHash) {
    const { rows } = await this.db.query(
      `SELECT id, usuario_id, rotado_en
         FROM sesiones
        WHERE token_hash_anterior = $1
          AND expira_en > NOW()`,
      [tokenHash],
    );
    return rows[0] ? { id: rows[0].id, usuarioId: rows[0].usuario_id, rotadoEn: rows[0].rotado_en } : null;
  }

  async eliminarPorId(id) {
    await this.db.query('DELETE FROM sesiones WHERE id = $1', [id]);
  }

  async eliminarPorToken(tokenHash) {
    await this.db.query('DELETE FROM sesiones WHERE token_hash = $1 OR token_hash_anterior = $1', [tokenHash]);
  }

  async eliminarDeUsuario(usuarioId) {
    await this.db.query('DELETE FROM sesiones WHERE usuario_id = $1', [usuarioId]);
  }

  /** Cierra todas las sesiones de la persona menos la actual (al cambiar la contraseña). */
  async eliminarDeUsuarioExcepto(usuarioId, sesionId) {
    await this.db.query(`DELETE FROM sesiones WHERE usuario_id = $1 AND id <> $2`, [usuarioId, sesionId]);
  }

  async eliminarVencidas() {
    await this.db.query('DELETE FROM sesiones WHERE expira_en <= NOW()');
  }
}
