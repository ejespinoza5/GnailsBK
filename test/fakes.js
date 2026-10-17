import { randomUUID } from 'node:crypto';

/** Repositorios en memoria: misma interfaz que los reales, sin BDD. */
export class UsuarioRepositoryFalso {
  constructor() {
    this.usuarios = new Map();
  }

  #buscar(fn) {
    const u = [...this.usuarios.values()].find(fn);
    return Promise.resolve(u ? { ...u } : null);
  }

  buscarPorId(id) {
    return this.#buscar((u) => u.id === id);
  }
  buscarPorEmail(email) {
    return this.#buscar((u) => u.email === email);
  }
  buscarPorGoogleId(googleId) {
    return this.#buscar((u) => u.googleId === googleId);
  }

  async crear({ nombre, email, passwordHash = null, googleId = null, avatarUrl = null, emailVerificado = false }) {
    const u = {
      id: randomUUID(), nombre, email, passwordHash, googleId, avatarUrl, emailVerificado,
      rol: 'cliente', activo: true, intentosFallidos: 0, bloqueadoHasta: null, creadoEn: new Date(),
    };
    this.usuarios.set(u.id, u);
    return { ...u };
  }

  async registrarIntentoFallido(id, { maxIntentos, minutosBloqueo }) {
    const u = this.usuarios.get(id);
    u.intentosFallidos += 1;
    if (u.intentosFallidos >= maxIntentos) u.bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
  }

  async reiniciarIntentos(id) {
    Object.assign(this.usuarios.get(id), { intentosFallidos: 0, bloqueadoHasta: null });
  }

  async registrarAccesoExitoso(id) {
    Object.assign(this.usuarios.get(id), { intentosFallidos: 0, bloqueadoHasta: null });
  }
}

export class SesionRepositoryFalso {
  constructor() {
    this.sesiones = new Map();
  }

  async crear({ usuarioId, tokenHash, expiraEn }) {
    const id = randomUUID();
    this.sesiones.set(id, { id, usuarioId, tokenHash, tokenHashAnterior: null, rotadoEn: null, expiraEn });
    return id;
  }

  async rotar({ tokenHashActual, tokenHashNuevo, expiraEn }) {
    const s = [...this.sesiones.values()].find((x) => x.tokenHash === tokenHashActual && x.expiraEn > new Date());
    if (!s) return null;
    Object.assign(s, { tokenHashAnterior: s.tokenHash, tokenHash: tokenHashNuevo, rotadoEn: new Date(), expiraEn });
    return { id: s.id, usuarioId: s.usuarioId };
  }

  async buscarPorTokenAnterior(tokenHash) {
    const s = [...this.sesiones.values()].find((x) => x.tokenHashAnterior === tokenHash && x.expiraEn > new Date());
    return s ? { id: s.id, usuarioId: s.usuarioId, rotadoEn: s.rotadoEn } : null;
  }

  async eliminarPorId(id) {
    this.sesiones.delete(id);
  }
  async eliminarPorToken(h) {
    for (const s of this.sesiones.values()) if (s.tokenHash === h || s.tokenHashAnterior === h) this.sesiones.delete(s.id);
  }
  async eliminarDeUsuario(usuarioId) {
    for (const s of this.sesiones.values()) if (s.usuarioId === usuarioId) this.sesiones.delete(s.id);
  }
  async eliminarVencidas() {}
}

export class GoogleVerifierFalso {
  constructor(perfil) {
    this.perfil = perfil;
  }
  async verificar() {
    return this.perfil;
  }
}

export const loggerSilencioso = { warn() {}, error() {} };
