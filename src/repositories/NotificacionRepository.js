/**
 * Bandeja de notificaciones, dispositivos con push y preferencias.
 * Solo SQL parametrizado.
 */
function filaANotificacion(f) {
  return {
    id: f.id,
    tipo: f.tipo,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    url: f.url,
    leida: Boolean(f.leida_en),
    creadoEn: f.creado_en,
  };
}

export class NotificacionRepository {
  constructor(db) {
    this.db = db;
  }

  // ---------- Bandeja

  /** Crea la misma notificación para varias personas en una sola sentencia. */
  async crearParaVarios(usuarioIds, { tipo, titulo, cuerpo, url = null }) {
    if (!usuarioIds.length) return 0;
    const { rowCount } = await this.db.query(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, url)
       SELECT u, $2, $3, $4, $5 FROM unnest($1::uuid[]) AS u`,
      [usuarioIds, tipo, titulo, cuerpo, url],
    );
    return rowCount;
  }

  async listar(usuarioId, limite = 30) {
    const { rows } = await this.db.query(
      `SELECT * FROM notificaciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT $2`,
      [usuarioId, limite],
    );
    return rows.map(filaANotificacion);
  }

  async contarNoLeidas(usuarioId) {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL`,
      [usuarioId],
    );
    return rows[0].n;
  }

  /** Marca como leídas las indicadas (o todas si ids es null). Solo las de esa persona. */
  async marcarLeidas(usuarioId, ids = null) {
    await this.db.query(
      `UPDATE notificaciones SET leida_en = NOW()
        WHERE usuario_id = $1 AND leida_en IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [usuarioId, ids],
    );
  }

  async eliminarViejas(dias = 90) {
    await this.db.query(`DELETE FROM notificaciones WHERE creado_en < NOW() - make_interval(days => $1)`, [dias]);
  }

  // ---------- Dispositivos con push

  /** Si el token ya existía (otra persona en ese equipo), pasa a quien inicia sesión ahora. */
  async guardarDispositivo(usuarioId, token, userAgent) {
    await this.db.query(
      `INSERT INTO dispositivos_push (token, usuario_id, user_agent) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
          SET usuario_id = EXCLUDED.usuario_id, user_agent = EXCLUDED.user_agent, ultimo_uso = NOW()`,
      [token, usuarioId, userAgent],
    );
  }

  async quitarDispositivo(usuarioId, token) {
    await this.db.query(`DELETE FROM dispositivos_push WHERE token = $1 AND usuario_id = $2`, [token, usuarioId]);
  }

  async tokensDe(usuarioIds) {
    if (!usuarioIds.length) return [];
    const { rows } = await this.db.query(`SELECT token FROM dispositivos_push WHERE usuario_id = ANY($1::uuid[])`, [usuarioIds]);
    return rows.map((r) => r.token);
  }

  async contarDispositivos(usuarioId) {
    const { rows } = await this.db.query(`SELECT COUNT(*)::int AS n FROM dispositivos_push WHERE usuario_id = $1`, [usuarioId]);
    return rows[0].n;
  }

  async eliminarTokens(tokens) {
    if (tokens.length) await this.db.query(`DELETE FROM dispositivos_push WHERE token = ANY($1::varchar[])`, [tokens]);
  }

  // ---------- Preferencias y destinatarios

  async preferencias(usuarioId) {
    const { rows } = await this.db.query(
      `SELECT notif_recordatorios, notif_promociones FROM usuarios WHERE id = $1`,
      [usuarioId],
    );
    return { recordatorios: rows[0].notif_recordatorios, promociones: rows[0].notif_promociones };
  }

  async guardarPreferencias(usuarioId, { recordatorios, promociones }) {
    await this.db.query(
      `UPDATE usuarios SET notif_recordatorios = $2, notif_promociones = $3 WHERE id = $1`,
      [usuarioId, recordatorios, promociones],
    );
    return this.preferencias(usuarioId);
  }

  /** De la lista, quienes aceptan esa categoría (recordatorios o promociones) y siguen activas. */
  async filtrarPorPreferencia(usuarioIds, categoria) {
    if (!usuarioIds.length) return [];
    const columna = categoria === 'promocion' ? 'notif_promociones' : 'notif_recordatorios';
    const { rows } = await this.db.query(
      `SELECT id FROM usuarios WHERE id = ANY($1::uuid[]) AND activo AND ${columna}`,
      [usuarioIds],
    );
    return rows.map((r) => r.id);
  }

  async idsAdministradoras() {
    const { rows } = await this.db.query(`SELECT id FROM usuarios WHERE rol = 'admin' AND activo`);
    return rows.map((r) => r.id);
  }

  /** Clientas activas con el correo confirmado que aceptan promociones. */
  async idsClientasPromociones() {
    const { rows } = await this.db.query(
      `SELECT id FROM usuarios WHERE rol = 'cliente' AND activo AND email_verificado AND notif_promociones`,
    );
    return rows.map((r) => r.id);
  }

  async contarAudienciaPromociones() {
    const { rows } = await this.db.query(
      `SELECT COUNT(DISTINCT u.id)::int AS clientas, COUNT(DISTINCT d.usuario_id)::int AS con_push
         FROM usuarios u
         LEFT JOIN dispositivos_push d ON d.usuario_id = u.id
        WHERE u.rol = 'cliente' AND u.activo AND u.email_verificado AND u.notif_promociones`,
    );
    return { clientas: rows[0].clientas, conPush: rows[0].con_push };
  }

  // ---------- Recordatorios automáticos

  /**
   * Citas confirmadas de clientas con cuenta que empiezan en las próximas 24 h.
   * fecha + hora están en la hora local del salón; AT TIME ZONE las convierte al instante real.
   */
  async citasProximas(zonaHoraria) {
    const { rows } = await this.db.query(
      `SELECT c.id, c.cliente_id, c.fecha, c.hora_inicio, s.nombre AS servicio, p.nombre AS profesional,
              EXTRACT(EPOCH FROM ((c.fecha + c.hora_inicio) AT TIME ZONE $1) - NOW()) / 60 AS minutos,
              EXTRACT(EPOCH FROM NOW() - c.creado_en) / 60 AS minutos_desde_creada,
              EXTRACT(EPOCH FROM ((c.fecha + c.hora_inicio) AT TIME ZONE $1) - c.creado_en) / 60 AS anticipacion
         FROM citas c
         JOIN servicios s ON s.id = c.servicio_id
         JOIN profesionales p ON p.id = c.profesional_id
        WHERE c.estado = 'confirmada'
          AND c.cliente_id IS NOT NULL
          AND (c.fecha + c.hora_inicio) AT TIME ZONE $1 BETWEEN NOW() AND NOW() + INTERVAL '1441 minutes'`,
      [zonaHoraria],
    );
    return rows.map((f) => ({
      id: f.id,
      clienteId: f.cliente_id,
      fecha: f.fecha,
      hora: f.hora_inicio.slice(0, 5),
      servicio: f.servicio,
      profesional: f.profesional,
      minutos: Number(f.minutos),
      minutosDesdeCreada: Number(f.minutos_desde_creada),
      anticipacion: Number(f.anticipacion),
    }));
  }

  /** Reserva el envío de un recordatorio (cita + umbral). Devuelve false si ya se había enviado. */
  async reclamarRecordatorio(citaId, umbral) {
    const { rowCount } = await this.db.query(
      `INSERT INTO cita_recordatorios (cita_id, umbral) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [citaId, umbral],
    );
    return rowCount > 0;
  }

  /** Recordatorio manual: como máximo uno cada `minutos` por cita (umbral 0 = manual). */
  async reclamarRecordatorioManual(citaId, minutos) {
    const { rowCount } = await this.db.query(
      `INSERT INTO cita_recordatorios (cita_id, umbral) VALUES ($1, 0)
       ON CONFLICT (cita_id, umbral) DO UPDATE SET enviado_en = NOW()
        WHERE cita_recordatorios.enviado_en < NOW() - make_interval(mins => $2)`,
      [citaId, minutos],
    );
    return rowCount > 0;
  }
}
