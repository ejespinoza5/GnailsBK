import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/services/AuthService.js';
import { SesionService } from '../src/services/SesionService.js';
import { TokenService } from '../src/services/TokenService.js';
import { PasswordHasher } from '../src/services/PasswordHasher.js';
import { ConflictoError, DemasiadosIntentosError, NoAutenticadoError } from '../src/errors/AppError.js';
import { UsuarioRepositoryFalso, SesionRepositoryFalso, GoogleVerifierFalso, loggerSilencioso } from './fakes.js';

const PASS = 'Unhas#2026';

function armar({ perfilGoogle } = {}) {
  const usuarioRepo = new UsuarioRepositoryFalso();
  const sesionRepo = new SesionRepositoryFalso();
  const tokenService = new TokenService({ secreto: 'x'.repeat(32), accessMinutos: 15, refreshDias: 30 });
  const sesionService = new SesionService({ sesionRepo, usuarioRepo, tokenService, logger: loggerSilencioso });
  const authService = new AuthService({
    usuarioRepo,
    hasher: new PasswordHasher({ N: 2 ** 10 }), // parámetros bajos solo para que los tests sean rápidos
    googleVerifier: new GoogleVerifierFalso(perfilGoogle),
  });
  return { authService, sesionService, usuarioRepo, sesionRepo };
}

describe('AuthService', () => {
  let s;
  beforeEach(() => {
    s = armar({ perfilGoogle: { googleId: 'g-1', email: 'ana@test.com', nombre: 'Ana', avatarUrl: 'https://foto' } });
  });

  test('registra y guarda la contraseña cifrada, nunca en texto plano', async () => {
    const u = await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    assert.match(u.passwordHash, /^scrypt\$/);
    assert.ok(!u.passwordHash.includes(PASS));
  });

  test('no permite registrar dos veces el mismo correo', async () => {
    await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    await assert.rejects(s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS }), ConflictoError);
  });

  test('login correcto devuelve el usuario', async () => {
    await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    const u = await s.authService.login({ email: 'ana@test.com', password: PASS });
    assert.equal(u.email, 'ana@test.com');
  });

  test('mismo error si el correo no existe o la contraseña es incorrecta', async () => {
    await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    const e1 = await s.authService.login({ email: 'nadie@test.com', password: PASS }).catch((e) => e);
    const e2 = await s.authService.login({ email: 'ana@test.com', password: 'Mala#2026' }).catch((e) => e);
    assert.ok(e1 instanceof NoAutenticadoError && e2 instanceof NoAutenticadoError);
    assert.equal(e1.message, e2.message);
  });

  test('bloquea la cuenta tras 5 intentos fallidos, aunque luego ponga la contraseña correcta', async () => {
    await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    for (let i = 0; i < 5; i++) {
      await assert.rejects(s.authService.login({ email: 'ana@test.com', password: 'Mala#2026' }), NoAutenticadoError);
    }
    await assert.rejects(s.authService.login({ email: 'ana@test.com', password: PASS }), DemasiadosIntentosError);
  });

  test('Google crea la cuenta con el correo verificado', async () => {
    const u = await s.authService.loginGoogle('token');
    assert.equal(u.googleId, 'g-1');
    assert.equal(u.emailVerificado, true);
    assert.equal(u.passwordHash, null);
  });

  test('Google NO entra a una cuenta registrada con contraseña con el mismo correo', async () => {
    const conPassword = await s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS });
    await s.sesionService.iniciar(conPassword);

    const err = await s.authService.loginGoogle('token').catch((e) => e);

    assert.ok(err instanceof ConflictoError);
    assert.equal(err.codigo, 'CUENTA_CON_PASSWORD');
    const u = await s.usuarioRepo.buscarPorId(conPassword.id);
    assert.equal(u.googleId, null, 'no se vinculó');
    assert.ok(u.passwordHash, 'la contraseña sigue intacta');
    assert.equal(s.sesionRepo.sesiones.size, 1, 'su sesión no se tocó');
  });

  test('rechaza registrar con contraseña un correo que ya entra con Google', async () => {
    await s.authService.loginGoogle('token');
    await assert.rejects(
      s.authService.registrar({ nombre: 'Ana', email: 'ana@test.com', password: PASS }),
      (e) => e instanceof ConflictoError && /Google/.test(e.message),
    );
  });

  test('Google con la misma cuenta vuelve a entrar sin problema', async () => {
    const a = await s.authService.loginGoogle('token');
    const b = await s.authService.loginGoogle('token');
    assert.equal(a.id, b.id);
  });

  test('rechaza un correo que ya tiene otra cuenta de Google', async () => {
    await s.usuarioRepo.crear({ nombre: 'Ana', email: 'ana@test.com', googleId: 'g-OTRO', emailVerificado: true });
    await assert.rejects(s.authService.loginGoogle('token'), ConflictoError);
  });
});
