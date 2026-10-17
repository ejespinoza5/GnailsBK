import { z } from 'zod';

export const esquemaLeer = z
  .object({ ids: z.array(z.uuid()).max(100).nullish().transform((v) => v ?? null) })
  .strict();

export const esquemaDispositivo = z
  .object({ token: z.string().trim().min(20).max(512).regex(/^[A-Za-z0-9_:\-]+$/, 'Token inválido') })
  .strict();

export const esquemaPreferencias = z.object({ recordatorios: z.boolean(), promociones: z.boolean() }).strict();

/** Enlace del aviso: una pantalla de la app ("/reservar") o una página https. Nunca "javascript:". */
const enlace = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    if (/^\/(?!\/)[A-Za-z0-9\-_/?=&#%.]*$/.test(v)) return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Usa una pantalla de la app (por ejemplo /reservar) o un enlace https://')
  .nullish()
  .or(z.literal(''))
  .transform((v) => v || null);

export const esquemaCampana = z
  .object({
    titulo: z.string({ error: 'Escribe el título' }).trim().min(3, 'Mínimo 3 caracteres').max(80, 'Máximo 80 caracteres'),
    cuerpo: z.string({ error: 'Escribe el mensaje' }).trim().min(3, 'Mínimo 3 caracteres').max(240, 'Máximo 240 caracteres'),
    url: enlace,
    envio: z.enum(['ahora', 'programar']),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
      .nullish(),
    hora: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
      .nullish(),
  })
  .strict()
  .refine((d) => d.envio === 'ahora' || (d.fecha && d.hora), { path: ['fecha'], message: 'Elige fecha y hora para programarla' });
