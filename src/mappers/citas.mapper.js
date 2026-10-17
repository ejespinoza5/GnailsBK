import { horaCorta } from '../utils/tiempo.js';

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/** Fila de BDD (snake_case) → objeto de dominio (camelCase). */
export function filaAServicio(f) {
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    duracionMin: f.duracion_min,
    precio: numero(f.precio),
    precioTipo: f.precio_tipo ?? 'fijo',
    precioMax: numero(f.precio_max),
    disponibleDesde: f.disponible_desde,
    disponibleHasta: f.disponible_hasta,
    activo: f.activo,
    ...(f.profesionales !== undefined && { profesionales: Number(f.profesionales) }),
  };
}

export function filaAProfesional(f) {
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    diasLaborales: (f.dias_laborales ?? []).map(Number).sort(),
    activo: f.activo,
    servicios: f.servicios ?? [],
    // Cuenta con la que la profesional entra a la app (solo lo ve la dueña)
    cuenta: f.usuario_id ? { id: f.usuario_id, email: f.usuario_email ?? null, nombre: f.usuario_nombre ?? null } : null,
  };
}

export function filaAHorario(f) {
  return {
    diaSemana: f.dia_semana,
    abierto: f.abierto,
    apertura: horaCorta(f.hora_apertura),
    cierre: horaCorta(f.hora_cierre),
  };
}

export function filaABloqueo(f) {
  if (!f) return null;
  return {
    id: f.id,
    fecha: f.fecha,
    profesionalId: f.profesional_id,
    profesionalNombre: f.profesional_nombre ?? null,
    motivo: f.motivo,
  };
}

export function filaAConfiguracion(f) {
  return {
    intervaloMin: f.intervalo_min,
    anticipacionMin: f.anticipacion_min,
    diasMaximos: f.dias_maximos,
    horasCancelacion: f.horas_cancelacion,
    maxCitasActivas: f.max_citas_activas,
    mensajeReserva: f.mensaje_reserva ?? '',
  };
}

export function filaACita(f) {
  if (!f) return null;
  return {
    id: f.id,
    clienteId: f.cliente_id,
    profesionalId: f.profesional_id,
    servicioId: f.servicio_id,
    fecha: f.fecha,
    horaInicio: horaCorta(f.hora_inicio),
    horaFin: horaCorta(f.hora_fin),
    precio: numero(f.precio),
    precioTipo: f.precio_tipo ?? 'fijo',
    precioMax: numero(f.precio_max),
    notas: f.notas,
    estado: f.estado,
    canceladaPor: f.cancelada_por,
    creadoEn: f.creado_en,
    // Datos de las tablas relacionadas (cuando la consulta los trae)
    servicioNombre: f.servicio_nombre,
    profesionalNombre: f.profesional_nombre,
    clienteNombre: f.cliente_nombre,
    clienteEmail: f.cliente_email,
    clienteTelefono: f.cliente_telefono,
    creadaPor: f.creada_por ?? null,
  };
}

/** Lo que ve una clienta de un servicio. */
export function servicioAPublico(s) {
  return {
    id: s.id,
    nombre: s.nombre,
    descripcion: s.descripcion,
    duracionMin: s.duracionMin,
    precio: s.precio,
    precioTipo: s.precioTipo,
    precioMax: s.precioMax,
    disponibleDesde: s.disponibleDesde,
    disponibleHasta: s.disponibleHasta,
  };
}

/** Lo que ve una clienta de una profesional (sin datos internos). */
export function profesionalAPublico(p) {
  return { id: p.id, nombre: p.nombre, descripcion: p.descripcion };
}

/** Lo que ve una clienta de su propia cita. */
export function citaAPublico(c) {
  return {
    id: c.id,
    fecha: c.fecha,
    horaInicio: c.horaInicio,
    horaFin: c.horaFin,
    precio: c.precio,
    precioTipo: c.precioTipo,
    precioMax: c.precioMax,
    notas: c.notas,
    estado: c.estado,
    canceladaPor: c.canceladaPor,
    servicio: { id: c.servicioId, nombre: c.servicioNombre },
    profesional: { id: c.profesionalId, nombre: c.profesionalNombre },
  };
}

/** La administradora ve además quién es la clienta. */
export function citaAAdmin(c) {
  return {
    ...citaAPublico(c),
    cliente: {
      id: c.clienteId,
      nombre: c.clienteNombre,
      email: c.clienteEmail ?? null,
      telefono: c.clienteTelefono ?? null,
      conCuenta: Boolean(c.clienteId),
    },
    agendadaPorSalon: Boolean(c.creadaPor),
    creadoEn: c.creadoEn,
  };
}
