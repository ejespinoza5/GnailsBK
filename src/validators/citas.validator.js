import { z } from 'zod';

// ---------- Piezas reutilizables

const id = z.uuid({ error: 'Identificador inválido' });

const fecha = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Fecha inválida');

const hora = z.string({ error: 'La hora es obligatoria' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida');

/** Texto opcional: "" o solo espacios se guarda como null. */
const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => v || null);

const nombre = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .max(100, 'Máximo 100 caracteres');

const ESTADOS = ['confirmada', 'completada', 'cancelada', 'no_asistio'];

// ---------- Parámetros de ruta

export const esquemaParamId = z.object({ id });

// ---------- Clienta

export const esquemaDisponibilidad = z
  .object({
    servicioId: id,
    profesionalId: id.optional(),
    desde: fecha,
    dias: z.coerce.number().int().min(1).max(14).default(7),
  })
  .strict();

export const esquemaReserva = z
  .object({
    servicioId: id,
    profesionalId: id.nullish().transform((v) => v ?? null),
    fecha,
    hora,
    notas: textoOpcional(300),
  })
  .strict();

// ---------- Administradora

export const esquemaServicio = z
  .object({
    nombre,
    descripcion: textoOpcional(500),
    duracionMin: z.coerce
      .number({ error: 'La duración es obligatoria' })
      .int('Usa minutos enteros')
      .min(5, 'Mínimo 5 minutos')
      .max(480, 'Máximo 8 horas'),
    precio: z.coerce
      .number()
      .min(0, 'El precio no puede ser negativo')
      .max(100000, 'Precio demasiado alto')
      .multipleOf(0.01, 'Máximo 2 decimales')
      .nullish()
      .transform((v) => v ?? null),
    // fijo: $18,50 · desde: Desde $25,00 · rango: $20,00 – $35,00
    precioTipo: z.enum(['fijo', 'desde', 'rango'], { error: 'Tipo de precio inválido' }).default('fijo'),
    precioMax: z.coerce
      .number()
      .min(0)
      .max(100000, 'Precio demasiado alto')
      .multipleOf(0.01, 'Máximo 2 decimales')
      .nullish()
      .transform((v) => v ?? null),
    disponibleDesde: fecha.nullish().transform((v) => v ?? null),
    disponibleHasta: fecha.nullish().transform((v) => v ?? null),
    activo: z.boolean().default(true),
  })
  .strict()
  .refine((d) => !d.disponibleDesde || !d.disponibleHasta || d.disponibleHasta >= d.disponibleDesde, {
    path: ['disponibleHasta'],
    message: 'Debe ser igual o posterior a la fecha de inicio',
  })
  .refine((d) => d.precioTipo !== 'rango' || d.precio === null || (d.precioMax !== null && d.precioMax > d.precio), {
    path: ['precioMax'],
    message: 'El precio máximo debe ser mayor que el mínimo',
  })
  // Sin precio no hay "desde" ni rango; y solo el rango guarda el máximo.
  .transform((d) => ({
    ...d,
    precioTipo: d.precio === null ? 'fijo' : d.precioTipo,
    precioMax: d.precio !== null && d.precioTipo === 'rango' ? d.precioMax : null,
  }));

export const esquemaProfesional = z
  .object({
    nombre,
    descripcion: textoOpcional(300),
    diasLaborales: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Elige al menos un día')
      .max(7)
      .transform((d) => [...new Set(d)].sort()),
    servicios: z
      .array(id)
      .max(200)
      .transform((s) => [...new Set(s)]),
    activo: z.boolean().default(true),
  })
  .strict();

export const esquemaHorario = z
  .object({
    dias: z
      .array(
        z
          .object({ diaSemana: z.number().int().min(0).max(6), abierto: z.boolean(), apertura: hora, cierre: hora })
          .strict()
          .refine((d) => d.cierre > d.apertura, { path: ['cierre'], message: 'El cierre debe ser después de la apertura' }),
      )
      .length(7, 'Envía los 7 días de la semana')
      .refine((d) => new Set(d.map((x) => x.diaSemana)).size === 7, 'Hay días repetidos'),
  })
  .strict();

export const esquemaBloqueo = z
  .object({
    fecha,
    profesionalId: id.nullish().transform((v) => v ?? null),
    motivo: textoOpcional(150),
  })
  .strict();

export const esquemaRangoBloqueos = z.object({ desde: fecha, hasta: fecha }).strict();

export const esquemaConfiguracion = z
  .object({
    intervaloMin: z.union([10, 15, 20, 30, 45, 60].map((n) => z.literal(n)), { error: 'Intervalo inválido' }),
    anticipacionMin: z.number().int().min(0).max(10080),
    diasMaximos: z.number().int().min(1, 'Mínimo 1 día').max(365, 'Máximo 365 días'),
    horasCancelacion: z.number().int().min(0).max(168, 'Máximo 168 horas (7 días)'),
    maxCitasActivas: z.number().int().min(1, 'Mínimo 1').max(20, 'Máximo 20'),
    // Si no viene, se conserva el que había; vacío ('') a propósito = no mostrar mensaje.
    mensajeReserva: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  })
  .strict();

export const esquemaFiltroCitas = z
  .object({
    desde: fecha,
    hasta: fecha,
    profesionalId: id.optional(),
    estado: z.enum(ESTADOS).optional(),
  })
  .strict()
  .refine((d) => d.hasta >= d.desde, { path: ['hasta'], message: 'Rango inválido' })
  .refine((d) => (Date.parse(d.hasta) - Date.parse(d.desde)) / 86_400_000 <= 62, {
    path: ['hasta'],
    message: 'El rango máximo es de 62 días',
  });

export const esquemaEstadoCita = z.object({ estado: z.enum(ESTADOS, { error: 'Estado inválido' }) }).strict();

export const esquemaReprogramar = z.object({ fecha, hora, profesionalId: id }).strict();

export const esquemaDisponibilidadAdmin = z
  .object({
    servicioId: id,
    profesionalId: id.optional(),
    desde: fecha,
    dias: z.coerce.number().int().min(1).max(14).default(1),
    excluirCitaId: id.optional(),
  })
  .strict();

// ---------- Agenda del equipo (dueña y profesionales)

export const esquemaRangoAgenda = z
  .object({ desde: fecha, hasta: fecha })
  .strict()
  .refine((d) => d.hasta >= d.desde && (Date.parse(d.hasta) - Date.parse(d.desde)) / 86_400_000 <= 62, {
    path: ['hasta'],
    message: 'Rango inválido (máximo 62 días)',
  });

export const esquemaAgendar = z
  .object({
    clienteId: id.nullish().transform((v) => v ?? null),
    clienteNombre: textoOpcional(100),
    clienteTelefono: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Escribe solo números (puedes empezar con +)')
      .nullish()
      .or(z.literal(''))
      .transform((v) => v || null),
    servicioId: id,
    profesionalId: id.nullish().transform((v) => v ?? null),
    fecha,
    hora,
    notas: textoOpcional(300),
  })
  .strict()
  .refine((d) => d.clienteId || (d.clienteNombre && d.clienteNombre.length >= 2), {
    path: ['clienteNombre'],
    message: 'Elige una clienta o escribe el nombre de quien viene',
  });

export const esquemaBuscarClientas = z
  .object({ q: z.string().trim().min(2, 'Escribe al menos 2 letras').max(60) })
  .strict();

export const esquemaAcceso = z
  .object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Ingresa un correo válido' })) })
  .strict();
