import { z } from 'zod';

// Contraseñas más comunes: se rechazan aunque cumplan las reglas.
const PASSWORDS_COMUNES = new Set([
  'password1!', 'password123!', 'p@ssw0rd', 'p@ssword1', 'qwerty123!', 'admin123!',
  'welcome1!', 'contraseña1!', 'contrasena1!', 'abc12345!', '12345678a!', 'iloveyou1!',
]);

const email = z
  .string({ error: 'El correo es obligatorio' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo')
  .pipe(z.email({ error: 'Ingresa un correo válido' }));

export const password = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede superar los 128 caracteres')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un símbolo (por ejemplo ! @ # $ %)')
  .refine((v) => !/\s/.test(v), 'La contraseña no puede contener espacios')
  .refine((v) => !/(.)\1{3,}/.test(v), 'No repitas el mismo carácter más de 3 veces seguidas')
  .refine((v) => !PASSWORDS_COMUNES.has(v.toLowerCase()), 'Esa contraseña es demasiado común');

export const nombre = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(100, 'El nombre es demasiado largo')
  .regex(/^[\p{L}\p{M}' .-]+$/u, 'El nombre solo puede contener letras, espacios, apóstrofes y guiones');

export const esquemaRegistro = z
  .object({ nombre, email, password })
  .strict()
  .refine((d) => {
    const usuarioCorreo = d.email.split('@')[0];
    return usuarioCorreo.length < 4 || !d.password.toLowerCase().includes(usuarioCorreo);
  }, {
    path: ['password'],
    message: 'La contraseña no puede contener tu correo',
  });

export const esquemaLogin = z
  .object({
    email,
    // En el login no se revelan las reglas: solo se exige que venga algo razonable.
    password: z.string({ error: 'La contraseña es obligatoria' }).min(1, 'La contraseña es obligatoria').max(128),
  })
  .strict();

export const esquemaGoogle = z
  .object({ credential: z.string().min(20).max(4096) })
  .strict();

// ---------- Recuperación de contraseña

export const esquemaOlvide = z.object({ email }).strict();

export const esquemaRestablecer = z
  .object({
    token: z.string({ error: 'Enlace inválido' }).regex(/^[A-Za-z0-9_-]{30,100}$/, 'El enlace no es válido'),
    password,
  })
  .strict();

// ---------- Cuenta

export const esquemaPerfil = z
  .object({
    nombre,
    telefono: z
      .string()
      .trim()
      .max(20, 'Máximo 20 caracteres')
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Escribe solo números (puedes empezar con +)')
      .nullish()
      .or(z.literal(''))
      .transform((v) => v || null),
  })
  .strict();

export const esquemaCambioPassword = z
  .object({
    actual: z.string({ error: 'Escribe tu contraseña actual' }).min(1, 'Escribe tu contraseña actual').max(128),
    nueva: password,
  })
  .strict();

// ---------- Verificación del correo

export const esquemaCodigo = z
  .object({
    codigo: z
      .string({ error: 'Escribe el código' })
      .trim()
      .regex(/^\d{6}$/, 'El código tiene 6 números'),
  })
  .strict();
