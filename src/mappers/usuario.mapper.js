/** Fila de la BDD (snake_case) → objeto de dominio (camelCase). */
export function filaAUsuario(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    telefono: fila.telefono ?? null,
    passwordHash: fila.password_hash ?? null,
    googleId: fila.google_id ?? null,
    avatarUrl: fila.avatar_url ?? null,
    rol: fila.rol,
    activo: fila.activo,
    emailVerificado: fila.email_verificado,
    intentosFallidos: fila.intentos_fallidos ?? 0,
    bloqueadoHasta: fila.bloqueado_hasta ?? null,
    creadoEn: fila.creado_en,
  };
}

/** Lo único que se envía al frontend: nunca el hash, intentos ni bloqueos. */
export function usuarioAPublico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    telefono: u.telefono ?? null,
    avatarUrl: u.avatarUrl,
    // Para saber si mostrar "cambiar contraseña" (las cuentas de Google no tienen)
    tienePassword: Boolean(u.passwordHash),
    rol: u.rol,
    emailVerificado: u.emailVerificado,
    creadoEn: u.creadoEn,
  };
}
