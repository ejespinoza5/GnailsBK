import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Carga server/.env sin importar desde qué carpeta se ejecute el comando.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

// Valida las variables de entorno al arrancar: si falta algo, la app no inicia.
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().min(1),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('false'),

  GOOGLE_CLIENT_ID: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  ACCESS_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Correo (recuperación de contraseña y avisos). Sin SMTP_HOST, en desarrollo
  // los correos no se envían: se guardan como .html en server/correos-dev/.
  APP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  CORREO_REMITENTE: z.string().default('Geovys Nails <no-responder@geovysnails.com>'),

  // Firebase Cloud Messaging (push). Sin estos datos, las push solo se registran en la consola.
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  // Cada cuántos segundos se revisan recordatorios y promociones programadas
  NOTIFICACIONES_INTERVALO_S: z.coerce.number().int().min(1).max(600).default(60),

  ZONA_HORARIA: z
    .string()
    .default('America/Guayaquil')
    .refine(zonaValida, 'zona horaria inválida (ejemplos: America/Guayaquil, America/Bogota, America/Mexico_City)'),
});

function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of resultado.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const e = resultado.data;

if (e.NODE_ENV === 'production' && !e.SMTP_HOST) {
  console.error('❌ En producción hay que configurar SMTP_HOST para enviar correos.');
  process.exit(1);
}

export const env = {
  ...e,
  esProduccion: e.NODE_ENV === 'production',
  origenesPermitidos: e.FRONTEND_URL.split(',').map((o) => o.trim().replace(/\/$/, '')),
  dbSsl: e.DB_SSL === 'true',
  // URL pública del frontend para los enlaces de los correos
  appUrl: (e.APP_URL || e.FRONTEND_URL.split(',')[0]).trim().replace(/\/$/, ''),
  firebase:
    e.FIREBASE_PROJECT_ID && e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY
      ? {
          projectId: e.FIREBASE_PROJECT_ID,
          clientEmail: e.FIREBASE_CLIENT_EMAIL,
          // En el .env la clave va en una sola línea con "\n" escritos; aquí se convierten en saltos reales.
          privateKey: e.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      : null,
  smtp: e.SMTP_HOST
    ? { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE === 'true', auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } }
    : null,
};
