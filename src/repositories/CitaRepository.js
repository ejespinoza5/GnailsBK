import { filaACita } from '../mappers/citas.mapper.js';

const SELECT_DETALLE = `
  SELECT c.id, c.cliente_id, c.profesional_id, c.servicio_id, c.fecha, c.hora_inicio, c.hora_fin,
         c.precio, c.precio_tipo, c.precio_max, c.notas, c.estado, c.cancelada_por, c.creado_en, c.creada_por, c.vista_en,
         s.nombre AS servicio_nombre, p.nombre AS profesional_nombre,
         -- Clienta con cuenta (usuarios) o agendada por el salón sin cuenta (columnas propias)
         COALESCE(u.nombre, c.cliente_nombre) AS cliente_nombre,
         u.email AS cliente_email,
         COALESCE(u.telefono, c.cliente_telefono) AS cliente_telefono
    FROM citas c
    JOIN servicios s      ON s.id = c.servicio_id
    JOIN profesionales p  ON p.id = c.profesional_id
    LEFT JOIN usuarios u  ON u.id = c.cliente_id`;

/** Tabla "citas". Solo SQL parametrizado, sin reglas de negocio. */
export class CitaRepository {
  constructor(db) {
    this.db = db;
  }

  async buscarPorId(id) {
    const { rows } = await this.db.query(`${SELECT_DETALLE} WHERE c.id = $1`, [id]);
    return filaACita(rows[0]);
  }

  async listarDeCliente(clienteId) {
    const { rows } = await this.db.query(
      `${SELECT_DETALLE} WHERE c.cliente_id = $1 ORDER BY c.fecha DESC, c.hora_inicio DESC LIMIT 200`,
      [clienteId],
    );
    return rows.map(filaACita);
  }

  /** Para la agenda de la administradora. Los filtros opcionales van como NULL. */
  async listar({ desde, hasta, profesionalId = null, estado = null }) {
    const { rows } = await this.db.query(
      `${SELECT_DETALLE}
        WHERE c.fecha BETWEEN $1 AND $2
          AND ($3::uuid IS NULL OR c.profesional_id = $3)
          AND ($4::varchar IS NULL OR c.estado = $4)
        ORDER BY c.fecha, c.hora_inicio, p.nombre
        LIMIT 2000`,
      [desde, hasta, profesionalId, estado],
    );
    return rows.map(filaACita);
  }

  /** Bloques ocupados (citas no canceladas) de varias profesionales en un rango de fechas. */
  async ocupadas({ desde, hasta, profesionalIds, excluirId = null }) {
    const { rows } = await this.db.query(
      `SELECT profesional_id, fecha, hora_inicio, hora_fin
         FROM citas
        WHERE fecha BETWEEN $1 AND $2
          AND profesional_id = ANY($3::uuid[])
          AND estado <> 'cancelada'
          AND ($4::uuid IS NULL OR id <> $4)`,
      [desde, hasta, profesionalIds, excluirId],
    );
    return rows.map((f) => ({
      profesionalId: f.profesional_id,
      fecha: f.fecha,
      inicio: f.hora_inicio.slice(0, 5),
      fin: f.hora_fin.slice(0, 5),
    }));
  }

  /** Citas confirmadas de la clienta que aún no empiezan. */
  async contarActivasFuturas(clienteId, ahora) {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS n
         FROM citas
        WHERE cliente_id = $1
          AND estado = 'confirmada'
          AND (fecha > $2 OR (fecha = $2 AND hora_inicio >= $3::time))`,
      [clienteId, ahora.fecha, ahora.hora],
    );
    return rows[0].n;
  }

  async crear(c) {
    const { rows } = await this.db.query(
      `INSERT INTO citas (cliente_id, profesional_id, servicio_id, fecha, hora_inicio, hora_fin, precio, notas,
                          cliente_nombre, cliente_telefono, creada_por, precio_tipo, precio_max, vista_en, vista_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               -- La agendó el salón: ya está vista
               CASE WHEN $11::uuid IS NOT NULL THEN NOW() END, $11)
       RETURNING id`,
      [
        c.clienteId,
        c.profesionalId,
        c.servicioId,
        c.fecha,
        c.horaInicio,
        c.horaFin,
        c.precio,
        c.notas,
        c.clienteNombre ?? null,
        c.clienteTelefono ?? null,
        c.creadaPor ?? null,
        c.precioTipo ?? 'fijo',
        c.precioMax ?? null,
      ],
    );
    return this.buscarPorId(rows[0].id);
  }

  /** Cambia el estado solo si la cita sigue en el estado esperado (evita carreras). */
  async cambiarEstado(id, { estado, canceladaPor = null, estadoActual = null }) {
    const { rowCount } = await this.db.query(
      `UPDATE citas
          SET estado = $2::varchar,
              cancelada_por = CASE WHEN $2::varchar = 'cancelada' THEN $3::varchar END,
              cancelada_en  = CASE WHEN $2::varchar = 'cancelada' THEN NOW() END
        WHERE id = $1
          AND ($4::varchar IS NULL OR estado = $4)`,
      [id, estado, canceladaPor, estadoActual],
    );
    return rowCount > 0 ? this.buscarPorId(id) : null;
  }

  /** Marca la cita como vista por el salón. Devuelve false si ya lo estaba (así se avisa una sola vez). */
  async marcarVista(id, usuarioId) {
    const { rowCount } = await this.db.query(
      `UPDATE citas SET vista_en = NOW(), vista_por = $2 WHERE id = $1 AND vista_en IS NULL`,
      [id, usuarioId],
    );
    return rowCount > 0;
  }

  async reprogramar(id, { profesionalId, fecha, horaInicio, horaFin }) {
    await this.db.query(
      `UPDATE citas
          SET profesional_id = $2, fecha = $3, hora_inicio = $4, hora_fin = $5
        WHERE id = $1`,
      [id, profesionalId, fecha, horaInicio, horaFin],
    );
    return this.buscarPorId(id);
  }

  async eliminar(id) {
    const { rowCount } = await this.db.query(`DELETE FROM citas WHERE id = $1`, [id]);
    return rowCount > 0;
  }
}
