import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { SesionService } from '../src/services/SesionService.js';
import { TokenService } from '../src/services/TokenService.js';
import { NoAutenticadoError, SesionExpiradaError, TokenExpiradoError } from '../src/errors/AppError.js';
import { UsuarioRepositoryFalso, SesionRepositoryFalso, loggerSilencioso } from './fakes.js';

const SECRETO = 'x'.repeat(32);

describe('SesionService', () => {
  let tokenService, sesionRepo, usuarioRepo, servicio, usuario;

  beforeEach(async () => {
    tokenService = new TokenService({ secreto: SECRETO, accessMinutos: 15, refreshDias: 30 });
    sesionRepo = new SesionRepositoryFalso();
    usuarioRepo = new UsuarioRepositoryFalso();
    servicio = new SesionService({ sesionRepo, usuarioRepo, tokenService, logger: loggerSilencioso });
    usuario = await usuarioRepo.crear({ nombre: 'Ana', email: 'ana@test.com', passwordHash: 'x' });
  });

  test('iniciar entrega un JWT válido y guarda solo el hash del refresh', async () => {
    const { accessToken, refreshToken } = await servicio.iniciar(usuario);
    const claims = await tokenService.verificarAccess(accessToken);
    assert.equal(claims.usuarioId, usuario.id);
    const [sesion] = sesionRepo.sesiones.values();
    assert.notEqual(sesion.tokenHash, refreshToken);
    assert.equal(sesion.tokenHash, tokenService.hashRefresh(refreshToken));
  });

  test('renovar rota el refresh token', async () => {
    const { refreshToken: r1 } = await servicio.iniciar(usuario);
    const { refreshToken: r2, accessToken } = await servicio.renovar(r1);
    assert.ok(r2 && r2 !== r1);
    assert.ok(accessToken);
  });

  test('token anterior dentro del periodo de gracia: entrega access sin rotar', async () => {
    const { refreshToken: r1 } = await servicio.iniciar(usuario);
    await servicio.renovar(r1);
    const res = await servicio.renovar(r1);
    assert.ok(res.accessToken);
    assert.equal(res.refreshToken, null);
  });

  test('reutilizar un token viejo fuera de la gracia revoca toda la sesión', async () => {
    const { refreshToken: r1 } = await servicio.iniciar(usuario);
    const { refreshToken: r2 } = await servicio.renovar(r1);
    for (const s of sesionRepo.sesiones.values()) s.rotadoEn = new Date(Date.now() - 5 * 60_000);

    await assert.rejects(servicio.renovar(r1), SesionExpiradaError);
    await assert.rejects(servicio.renovar(r2), SesionExpiradaError, 'el token nuevo tampoco sirve');
  });

  test('cerrar sesión invalida el refresh token', async () => {
    const { refreshToken } = await servicio.iniciar(usuario);
    await servicio.cerrar(refreshToken);
    await assert.rejects(servicio.renovar(refreshToken), SesionExpiradaError);
  });

  test('usuario desactivado no puede renovar', async () => {
    const { refreshToken } = await servicio.iniciar(usuario);
    usuarioRepo.usuarios.get(usuario.id).activo = false;
    await assert.rejects(servicio.renovar(refreshToken), SesionExpiradaError);
  });

  test('TokenService distingue JWT expirado de JWT falsificado', async () => {
    const expirado = await new SignJWT({ rol: 'cliente' }).setProtectedHeader({ alg: 'HS256' }).setSubject('u')
      .setIssuer('geovys-nails-api').setAudience('geovys-nails-app').setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRETO));
    const falso = await new SignJWT({ rol: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setSubject('u')
      .setIssuer('geovys-nails-api').setAudience('geovys-nails-app').setExpirationTime('1h')
      .sign(new TextEncoder().encode('y'.repeat(32)));

    await assert.rejects(tokenService.verificarAccess(expirado), TokenExpiradoError);
    await assert.rejects(tokenService.verificarAccess(falso), (e) => e instanceof NoAutenticadoError && !(e instanceof TokenExpiradoError));
  });
});
