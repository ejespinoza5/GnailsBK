import { filaAProfesional } from '../mappers/citas.mapper.js';

const SELECT_CON_SERVICIOS = `
  SELECT p.id, p.nombre, p.descripcion, p.dias_laborales, p.activo, p.usuario_id,
         u.email AS usuario_email, u.nombre AS usuario_nombre,
         COALESCE(array_agg(ps.servicio_id ORDER BY ps.servicio_id)
                  FILTER (WHERE ps.servicio_id IS NOT NULL), '{}') AS servicios
    FROM profesionales p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN profesional_servicios ps ON ps.profesional_id = p.id`;

/**
 * Tablas "profesionales" y "profesional_servicios".
 * Crear y actualizar son una sola sentencia SQL (CTE): o se guarda todo o nada.
 */
export class ProfesionalRepository {
  constructor(db) {
    this.db = db;
  }

  async listar() {
    const { rows } = await this.db.query(`${SELECT_CON_SERVICIOS} GROUP BY p.id, u.id ORDER BY p.activo DESC, p.nombre`);
    return rows.map(filaAProfesional);
  }

  /** Profesionales activas que hacen un servicio. */
  async listarPorServicio(servicioId) {
    const { rows } = await this.db.query(
      `${SELECT_CON_SERVICIOS}
        WHERE p.activo
          AND EXISTS (SELECT 1 FROM profesional_servicios x WHERE x.profesional_id = p.id AND x.servicio_id = $1)
        GROUP BY p.id, u.id
        ORDER BY p.nombre`,
      [servicioId],
    );
    return rows.map(filaAProfesional);
  }

  async buscarPorId(id) {
    const { rows } = await this.db.query(`${SELECT_CON_SERVICIOS} WHERE p.id = $1 GROUP BY p.id, u.id`, [id]);
    return filaAProfesional(rows[0]);
  }

  async crear(d) {
    const { rows } = await this.db.query(
      `WITH p AS (
         INSERT INTO profesionales (nombre, descripcion, dias_laborales, activo)
         VALUES ($1, $2, $3::smallint[], $4)
         RETURNING *
       ), s AS (
         INSERT INTO profesional_servicios (profesional_id, servicio_id)
         SELECT p.id, x FROM p, unnest($5::uuid[]) AS x
       )
       SELECT p.*, $5::uuid[] AS servicios FROM p`,
      [d.nombre, d.descripcion, d.diasLaborales, d.activo, d.servicios],
    );
    return filaAProfesional(rows[0]);
  }

  async actualizar(id, d) {
    const { rows } = await this.db.query(
      `WITH p AS (
         UPDATE profesionales
            SET nombre = $2, descripcion = $3, dias_laborales = $4::smallint[], activo = $5
          WHERE id = $1
          RETURNING *
       ), quitar AS (
         DELETE FROM profesional_servicios
          WHERE profesional_id = $1 AND EXISTS (SELECT 1 FROM p) AND NOT (servicio_id = ANY($6::uuid[]))
       ), agregar AS (
         INSERT INTO profesional_servicios (profesional_id, servicio_id)
         SELECT p.id, x FROM p, unnest($6::uuid[]) AS x
         ON CONFLICT DO NOTHING
       )
       SELECT p.*, $6::uuid[] AS servicios FROM p`,
      [id, d.nombre, d.descripcion, d.diasLaborales, d.activo, d.servicios],
    );
    return filaAProfesional(rows[0]);
  }

  async tieneCitas(id) {
    const { rows } = await this.db.query(`SELECT EXISTS (SELECT 1 FROM citas WHERE profesional_id = $1) AS hay`, [id]);
    return rows[0].hay;
  }

  async eliminar(id) {
    const { rowCount } = await this.db.query(`DELETE FROM profesionales WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  /** La profesional que usa esa cuenta (para saber de quién es la agenda). */
  async buscarPorUsuario(usuarioId) {
    const { rows } = await this.db.query(`${SELECT_CON_SERVICIOS} WHERE p.usuario_id = $1 GROUP BY p.id, u.id`, [usuarioId]);
    return filaAProfesional(rows[0]);
  }

  async vincularUsuario(id, usuarioId) {
    await this.db.query(`UPDATE profesionales SET usuario_id = $2 WHERE id = $1`, [id, usuarioId]);
    return this.buscarPorId(id);
  }
}
