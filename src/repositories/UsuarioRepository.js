import { filaAUsuario } from '../mappers/usuario.mapper.js';

const COLUMNAS = `id, nombre, email, telefono, password_hash, google_id, avatar_url, rol, activo,
                  email_verificado, intentos_fallidos, bloqueado_hasta, creado_en`;

/**
 * Acceso a datos de la tabla "usuarios". Solo SQL, sin reglas de negocio.
 * Todas las consultas son parametrizadas ($1, $2...): sin riesgo de inyección SQL.
 */
export class UsuarioRepository {
  /** @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} db */
  constructor(db) {
    this.db = db;
  }

  async #uno(sql, params) {
    const { rows } = await this.db.query(sql, params);
    return filaAUsuario(rows[0]);
  }

  buscarPorId(id) {
    return this.#uno(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]);
  }

  buscarPorEmail(email) {
    return this.#uno(`SELECT ${COLUMNAS} FROM usuarios WHERE email = $1`, [email]);
  }

  buscarPorGoogleId(googleId) {
    return this.#uno(`SELECT ${COLUMNAS} FROM usuarios WHERE google_id = $1`, [googleId]);
  }

  crear({ nombre, email, passwordHash = null, googleId = null, avatarUrl = null, emailVerificado = false }) {
    return this.#uno(
      `INSERT INTO usuarios (nombre, email, password_hash, google_id, avatar_url, email_verificado)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS}`,
      [nombre, email, passwordHash, googleId, avatarUrl, emailVerificado],
    );
  }

  async registrarIntentoFallido(id, { maxIntentos, minutosBloqueo }) {
    await this.db.query(
      `UPDATE usuarios
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado_hasta = CASE
                  WHEN intentos_fallidos + 1 >= $2 THEN NOW() + make_interval(mins => $3)
                  ELSE bloqueado_hasta
              END
        WHERE id = $1`,
      [id, maxIntentos, minutosBloqueo],
    );
  }

  async reiniciarIntentos(id) {
    await this.db.query(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`,
      [id],
    );
  }

  async registrarAccesoExitoso(id) {
    await this.db.query(
      `UPDATE usuarios
          SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW()
        WHERE id = $1`,
      [id],
    );
  }

  actualizarPerfil(id, { nombre, telefono }) {
    return this.#uno(
      `UPDATE usuarios SET nombre = $2, telefono = $3 WHERE id = $1 RETURNING ${COLUMNAS}`,
      [id, nombre, telefono],
    );
  }

  async actualizarPassword(id, passwordHash) {
    await this.db.query(
      `UPDATE usuarios
          SET password_hash = $2, intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = $1`,
      [id, passwordHash],
    );
  }

  actualizarAvatarUrl(id, avatarUrl) {
    return this.#uno(`UPDATE usuarios SET avatar_url = $2 WHERE id = $1 RETURNING ${COLUMNAS}`, [id, avatarUrl]);
  }

  marcarEmailVerificado(id) {
    return this.#uno(`UPDATE usuarios SET email_verificado = TRUE WHERE id = $1 RETURNING ${COLUMNAS}`, [id]);
  }

  async actualizarRol(id, rol) {
    await this.db.query(`UPDATE usuarios SET rol = $2 WHERE id = $1`, [id, rol]);
  }

  /** Busca clientas por nombre, correo o teléfono (para agendar desde el salón). */
  async buscarClientas(texto, limite = 8) {
    // Los comodines de LIKE (% y _) que escriba la persona se toman como texto normal.
    const patron = `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS} FROM usuarios
        WHERE rol = 'cliente' AND activo
          AND (nombre ILIKE $1 OR email ILIKE $1 OR telefono ILIKE $1)
        ORDER BY nombre
        LIMIT $2`,
      [patron, limite],
    );
    return rows.map(filaAUsuario);
  }
}
