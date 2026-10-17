/** Tabla "recuperaciones_password". Solo se guarda el hash del token. */
export class RecuperacionRepository {
  constructor(db) {
    this.db = db;
  }

  async crear({ usuarioId, tokenHash, minutos, ip }) {
    await this.db.query(
      `INSERT INTO recuperaciones_password (usuario_id, token_hash, expira_en, ip)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
      [usuarioId, tokenHash, minutos, ip],
    );
  }

  /** ¿Se pidió un enlace hace menos de X segundos? (evita llenar la bandeja de alguien) */
  async hayReciente(usuarioId, segundos) {
    const { rows } = await this.db.query(
      `SELECT EXISTS (
         SELECT 1 FROM recuperaciones_password
          WHERE usuario_id = $1 AND creado_en > NOW() - make_interval(secs => $2)
       ) AS hay`,
      [usuarioId, segundos],
    );
    return rows[0].hay;
  }

  /** Usuario de un token vigente, sin gastarlo (para validar antes de usarlo). */
  async buscarVigente(tokenHash) {
    const { rows } = await this.db.query(
      `SELECT usuario_id FROM recuperaciones_password
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > NOW()`,
      [tokenHash],
    );
    return rows[0]?.usuario_id ?? null;
  }

  /** Marca el token como usado y devuelve el usuario, en una sola sentencia (no se puede usar dos veces). */
  async consumir(tokenHash) {
    const { rows } = await this.db.query(
      `UPDATE recuperaciones_password
          SET usado_en = NOW()
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > NOW()
        RETURNING usuario_id`,
      [tokenHash],
    );
    return rows[0]?.usuario_id ?? null;
  }

  /** Invalida los enlaces pendientes de la persona (al pedir uno nuevo o al cambiar la contraseña). */
  async invalidarDeUsuario(usuarioId) {
    await this.db.query(
      `UPDATE recuperaciones_password SET usado_en = NOW() WHERE usuario_id = $1 AND usado_en IS NULL`,
      [usuarioId],
    );
  }

  async eliminarVencidas() {
    await this.db.query(`DELETE FROM recuperaciones_password WHERE expira_en < NOW() - INTERVAL '7 days'`);
  }
}
