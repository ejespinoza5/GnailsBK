import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VerificacionService } from '../src/services/VerificacionService.js';
import { DemasiadosIntentosError, ValidacionError } from '../src/errors/AppError.js';
import { UsuarioRepositoryFalso, loggerSilencioso } from './fakes.js';

/** Repositorio en memoria con la misma interfaz que el real. */
class VerificacionRepositoryFalso {
  constructor() {
    this.filas = new Map();
  }
  async guardar({ usuarioId, codigoHash, minutos }) {
    this.filas.set(usuarioId, { codigoHash, expiraEn: new Date(Date.now() + minutos * 60_000), intentos: 0, creadoEn: Date.now() });
  }
  async obtener(usuarioId) {
    const f = this.filas.get(usuarioId);
    return f ? { expiraEn: f.expiraEn, intentos: f.intentos, segundosDesde: Math.floor((Date.now() - f.creadoEn) / 1000) } : null;
  }
  async usarIntento(usuarioId, max) {
    const f = this.filas.get(usuarioId);
    if (!f || f.intentos >= max || f.expiraEn <= new Date()) return null;
    f.intentos += 1;
    return { codigoHash: f.codigoHash, intentos: f.intentos };
  }
  async eliminar(usuarioId) {
    this.filas.delete(usuarioId);
  }
}

describe('VerificacionService', () => {
  let s, usuario, enviados;

  beforeEach(async () => {
    const usuarioRepo = new UsuarioRepositoryFalso();
    usuarioRepo.marcarEmailVerificado = async (id) => {
      usuarioRepo.usuarios.get(id).emailVerificado = true;
      return { ...usuarioRepo.usuarios.get(id) };
    };
    enviados = [];
    const verificacionRepo = new VerificacionRepositoryFalso();
    s = {
      repo: verificacionRepo,
      servicio: new VerificacionService({
        usuarioRepo,
        verificacionRepo,
        correoService: { enviarCodigoVerificacion: async (u, codigo, minutos) => enviados.push({ codigo, minutos }) },
        secreto: 'x'.repeat(32),
        logger: loggerSilencioso,
      }),
    };
    usuario = await usuarioRepo.crear({ nombre: 'Ana', email: 'ana@test.com', passwordHash: 'x' });
  });

  test('envía un código de 6 dígitos que vence en 15 minutos y no lo guarda en claro', async () => {
    const estado = await s.servicio.enviarCodigo(usuario, { forzar: true });
    assert.match(enviados[0].codigo, /^\d{6}$/);
    assert.equal(enviados[0].minutos, 15);
    const minutos = (new Date(estado.expiraEn) - Date.now()) / 60_000;
    assert.ok(minutos > 14.9 && minutos <= 15);
    assert.notEqual(s.repo.filas.get(usuario.id).codigoHash, enviados[0].codigo);
  });

  test('el código correcto verifica el correo y se borra', async () => {
    await s.servicio.enviarCodigo(usuario, { forzar: true });
    const u = await s.servicio.verificar(usuario.id, enviados[0].codigo);
    assert.equal(u.emailVerificado, true);
    assert.equal(s.repo.filas.size, 0);
  });

  test('tras 5 intentos fallidos el código deja de servir, aunque luego se escriba bien', async () => {
    await s.servicio.enviarCodigo(usuario, { forzar: true });
    const malo = enviados[0].codigo === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 0; i--) {
      await assert.rejects(s.servicio.verificar(usuario.id, malo), (e) => e instanceof ValidacionError && (i ? e.message.includes(String(i)) : true));
    }
    await assert.rejects(s.servicio.verificar(usuario.id, enviados[0].codigo), /venció o ya no tiene intentos/);
  });

  test('un código vencido no sirve', async () => {
    await s.servicio.enviarCodigo(usuario, { forzar: true });
    s.repo.filas.get(usuario.id).expiraEn = new Date(Date.now() - 1000);
    await assert.rejects(s.servicio.verificar(usuario.id, enviados[0].codigo), ValidacionError);
  });

  test('pedir otro código exige esperar 60 s y el nuevo reemplaza al anterior', async () => {
    await s.servicio.enviarCodigo(usuario, { forzar: true });
    await assert.rejects(s.servicio.enviarCodigo(usuario), DemasiadosIntentosError);

    s.repo.filas.get(usuario.id).creadoEn -= 61_000;
    await s.servicio.enviarCodigo(usuario);
    const [viejo, nuevo] = enviados.map((e) => e.codigo);
    if (viejo !== nuevo) await assert.rejects(s.servicio.verificar(usuario.id, viejo), ValidacionError);
    const u = await s.servicio.verificar(usuario.id, nuevo);
    assert.equal(u.emailVerificado, true);
  });
});
