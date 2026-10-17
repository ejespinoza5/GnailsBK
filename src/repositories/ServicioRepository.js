import { filaAServicio } from '../mappers/citas.mapper.js';

const COLUMNAS = `s.id, s.nombre, s.descripcion, s.duracion_min, s.precio, s.precio_tipo, s.precio_max,
                  s.disponible_desde, s.disponible_hasta, s.activo`;

/** Tabla "servicios". Solo SQL parametrizado, sin reglas de negocio. */
export class ServicioRepository {
  constructor(db) {
    this.db = db;
  }

  /** Para la administradora: todos, con cuántas profesionales activas los hacen. */
  async listar() {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS},
              (SELECT COUNT(*) FROM profesional_servicios ps
                 JOIN profesionales p ON p.id = ps.profesional_id AND p.activo
                WHERE ps.servicio_id = s.id) AS profesionales
         FROM servicios s
        ORDER BY s.activo DESC, s.nombre`,
    );
    return rows.map(filaAServicio);
  }

  /** Para las clientas: activos, que no hayan terminado y con alguna profesional activa. */
  async listarReservables(hoy) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS}
         FROM servicios s
        WHERE s.activo
          AND (s.disponible_hasta IS NULL OR s.disponible_hasta >= $1)
          AND EXISTS (SELECT 1 FROM profesional_servicios ps
                        JOIN profesionales p ON p.id = ps.profesional_id AND p.activo
                       WHERE ps.servicio_id = s.id)
        ORDER BY s.nombre`,
      [hoy],
    );
    return rows.map(filaAServicio);
  }

  async buscarPorId(id) {
    const { rows } = await this.db.query(`SELECT ${COLUMNAS} FROM servicios s WHERE s.id = $1`, [id]);
    return filaAServicio(rows[0]);
  }

  async contarExistentes(ids) {
    const { rows } = await this.db.query(`SELECT COUNT(*)::int AS n FROM servicios WHERE id = ANY($1::uuid[])`, [ids]);
    return rows[0].n;
  }

  async crear(d) {
    const { rows } = await this.db.query(
      `INSERT INTO servicios AS s (nombre, descripcion, duracion_min, precio, disponible_desde, disponible_hasta, activo, precio_tipo, precio_max)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNAS}`,
      [d.nombre, d.descripcion, d.duracionMin, d.precio, d.disponibleDesde, d.disponibleHasta, d.activo, d.precioTipo, d.precioMax],
    );
    return filaAServicio(rows[0]);
  }

  async actualizar(id, d) {
    const { rows } = await this.db.query(
      `UPDATE servicios AS s
          SET nombre = $2, descripcion = $3, duracion_min = $4, precio = $5,
              disponible_desde = $6, disponible_hasta = $7, activo = $8, precio_tipo = $9, precio_max = $10
        WHERE s.id = $1
        RETURNING ${COLUMNAS}`,
      [id, d.nombre, d.descripcion, d.duracionMin, d.precio, d.disponibleDesde, d.disponibleHasta, d.activo, d.precioTipo, d.precioMax],
    );
    return filaAServicio(rows[0]);
  }

  async tieneCitas(id) {
    const { rows } = await this.db.query(`SELECT EXISTS (SELECT 1 FROM citas WHERE servicio_id = $1) AS hay`, [id]);
    return rows[0].hay;
  }

  async eliminar(id) {
    const { rowCount } = await this.db.query(`DELETE FROM servicios WHERE id = $1`, [id]);
    return rowCount > 0;
  }
}
