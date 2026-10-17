/** Tabla "avatares": la foto de perfil ya comprimida. Solo SQL parametrizado. */
export class AvatarRepository {
  constructor(db) {
    this.db = db;
  }

  async guardar(usuarioId, imagen, tipo = 'image/webp') {
    await this.db.query(
      `INSERT INTO avatares (usuario_id, imagen, tipo) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE
          SET imagen = EXCLUDED.imagen, tipo = EXCLUDED.tipo, actualizado_en = NOW()`,
      [usuarioId, imagen, tipo],
    );
  }

  async obtener(usuarioId) {
    const { rows } = await this.db.query(`SELECT imagen, tipo, actualizado_en FROM avatares WHERE usuario_id = $1`, [usuarioId]);
    return rows[0] ? { imagen: rows[0].imagen, tipo: rows[0].tipo, actualizadoEn: rows[0].actualizado_en } : null;
  }

  async eliminar(usuarioId) {
    await this.db.query(`DELETE FROM avatares WHERE usuario_id = $1`, [usuarioId]);
  }
}
