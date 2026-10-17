import { filaABloqueo, filaAConfiguracion, filaAHorario } from '../mappers/citas.mapper.js';

/**
 * Configuración de la agenda del local: horario semanal, días bloqueados
 * y reglas de reserva. Solo SQL parametrizado.
 */
export class AgendaRepository {
  constructor(db) {
    this.db = db;
  }

  // ---------- Horario semanal

  async obtenerHorario() {
    const { rows } = await this.db.query(
      `SELECT dia_semana, abierto, hora_apertura, hora_cierre FROM horario_semanal ORDER BY dia_semana`,
    );
    return rows.map(filaAHorario);
  }

  /** Guarda los 7 días en una sola sentencia. */
  async guardarHorario(dias) {
    await this.db.query(
      `INSERT INTO horario_semanal (dia_semana, abierto, hora_apertura, hora_cierre)
       SELECT * FROM unnest($1::smallint[], $2::boolean[], $3::time[], $4::time[])
       ON CONFLICT (dia_semana) DO UPDATE
          SET abierto = EXCLUDED.abierto,
              hora_apertura = EXCLUDED.hora_apertura,
              hora_cierre = EXCLUDED.hora_cierre`,
      [dias.map((d) => d.diaSemana), dias.map((d) => d.abierto), dias.map((d) => d.apertura), dias.map((d) => d.cierre)],
    );
    return this.obtenerHorario();
  }

  // ---------- Días bloqueados

  async listarBloqueos({ desde, hasta }) {
    const { rows } = await this.db.query(
      `SELECT b.id, b.fecha, b.profesional_id, b.motivo, p.nombre AS profesional_nombre
         FROM dias_bloqueados b
         LEFT JOIN profesionales p ON p.id = b.profesional_id
        WHERE b.fecha BETWEEN $1 AND $2
        ORDER BY b.fecha, p.nombre NULLS FIRST`,
      [desde, hasta],
    );
    return rows.map(filaABloqueo);
  }

  async crearBloqueo({ fecha, profesionalId, motivo }) {
    const { rows } = await this.db.query(
      `INSERT INTO dias_bloqueados (fecha, profesional_id, motivo)
       VALUES ($1, $2, $3)
       RETURNING id, fecha, profesional_id, motivo`,
      [fecha, profesionalId, motivo],
    );
    return filaABloqueo(rows[0]);
  }

  async eliminarBloqueo(id) {
    const { rowCount } = await this.db.query(`DELETE FROM dias_bloqueados WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  // ---------- Reglas de reserva

  async obtenerConfiguracion() {
    const { rows } = await this.db.query(`SELECT * FROM configuracion WHERE id = 1`);
    return filaAConfiguracion(rows[0]);
  }

  async guardarConfiguracion(c) {
    const { rows } = await this.db.query(
      `UPDATE configuracion
          SET intervalo_min = $1, anticipacion_min = $2, dias_maximos = $3,
              horas_cancelacion = $4, max_citas_activas = $5, mensaje_reserva = COALESCE($6::varchar, mensaje_reserva)
        WHERE id = 1
        RETURNING *`,
      [c.intervaloMin, c.anticipacionMin, c.diasMaximos, c.horasCancelacion, c.maxCitasActivas, c.mensajeReserva ?? null],
    );
    return filaAConfiguracion(rows[0]);
  }
}
