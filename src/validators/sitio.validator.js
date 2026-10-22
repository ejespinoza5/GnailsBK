import { z } from 'zod';

const opcional = (max) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => v || null);

/** Solo enlaces https: un "javascript:" o "data:" nunca llega a la página pública. */
const enlace = z
  .string()
  .trim()
  .max(500, 'El enlace es demasiado largo')
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Debe ser un enlace que empiece con https://')
  .nullish()
  .or(z.literal(''))
  .transform((v) => v || null);

const coordenada = (min, max, nombre) =>
  z
    .number({ error: `${nombre} inválida` })
    .min(min, `${nombre} inválida`)
    .max(max, `${nombre} inválida`)
    .nullish()
    .transform((v) => (v === undefined || v === null ? null : Number(v.toFixed(6))));

export const esquemaTextosSitio = z
  .object({
    heroTitulo: z.string({ error: 'Escribe el título' }).trim().min(3, 'Mínimo 3 caracteres').max(120, 'Máximo 120 caracteres'),
    heroSubtitulo: z.string().trim().max(240, 'Máximo 240 caracteres').default(''),
  })
  .strict();

export const esquemaUbicacion = z
  .object({
    direccion: opcional(200),
    referencia: opcional(200),
    latitud: coordenada(-90, 90, 'Latitud'),
    longitud: coordenada(-180, 180, 'Longitud'),
    mapsUrl: enlace,
    whatsapp: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Escribe solo números (puedes empezar con +)')
      .nullish()
      .or(z.literal(''))
      .transform((v) => v || null),
    instagram: z
      .string()
      .trim()
      .regex(/^@?[A-Za-z0-9._]{1,30}$/, 'Escribe solo el usuario, por ejemplo @geovysnails')
      .nullish()
      .or(z.literal(''))
      .transform((v) => (v ? v.replace(/^@/, '') : null)),
    facebook: enlace,
    tiktok: z
      .string()
      .trim()
      .regex(/^@?[A-Za-z0-9._]{2,24}$/, 'Escribe solo el usuario, por ejemplo @geovysnails')
      .nullish()
      .or(z.literal(''))
      .transform((v) => (v ? v.replace(/^@/, '') : null)),
  })
  .strict()
  .refine((d) => (d.latitud === null) === (d.longitud === null), {
    path: ['longitud'],
    message: 'Escribe latitud y longitud juntas',
  });

export const esquemaResolverMapa = z.object({ url: z.string({ error: 'Pega el enlace' }).trim().min(10).max(500) }).strict();

export const esquemaFotoGaleria = z
  .object({ titulo: opcional(100), visible: z.boolean().default(true) })
  .strict();

export const esquemaOrdenGaleria = z.object({ ids: z.array(z.uuid()).max(60) }).strict();

export const esquemaResena = z
  .object({
    calificacion: z.number({ error: 'Elige de 1 a 5 estrellas' }).int().min(1, 'Elige de 1 a 5 estrellas').max(5),
    comentario: opcional(600),
  })
  .strict();

export const esquemaModerarResena = z
  .object({ visible: z.boolean(), respuesta: opcional(600) })
  .strict();
