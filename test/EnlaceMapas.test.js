import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EnlaceMapas, extraerCoordenadas } from '../src/services/EnlaceMapas.js';
import { ValidacionError } from '../src/errors/AppError.js';
import { nombrePublico } from '../src/services/SitioService.js';

describe('EnlaceMapas', () => {
  test('lee las coordenadas de los formatos de Google Maps', () => {
    const casos = [
      ['https://www.google.com/maps/search/-0.225120,+-79.161901?entry=tts', [-0.22512, -79.161901]],
      ['https://www.google.com/maps/place/Geovys/@-0.2,-79.1,17z/data=!3m1!4m6!3m5!8m2!3d-0.225120!4d-79.161901', [-0.22512, -79.161901]],
      ['https://maps.google.com/?q=-0.2251,-79.1619', [-0.2251, -79.1619]],
      ['https://www.google.com/maps/@-0.2251,-79.1619,15z', [-0.2251, -79.1619]],
    ];
    for (const [url, [lat, lng]] of casos) {
      assert.deepEqual(extraerCoordenadas(new URL(url)), { latitud: lat, longitud: lng }, url);
    }
  });

  test('sigue la redirección del enlace corto sin salir de Google', async () => {
    const visitadas = [];
    const fetchFalso = async (url) => {
      visitadas.push(url);
      return { headers: new Map([['location', 'https://www.google.com/maps/search/-0.225120,+-79.161901']]) };
    };
    const e = new EnlaceMapas({ fetch: fetchFalso });
    const r = await e.resolver('https://maps.app.goo.gl/H2sf8dgsk6vrFJHz6');
    assert.deepEqual([r.latitud, r.longitud], [-0.22512, -79.161901]);
    assert.equal(visitadas.length, 1);
  });

  test('no visita enlaces que no son de Google ni redirecciones fuera de Google (SSRF)', async () => {
    let visitas = 0;
    const e = new EnlaceMapas({
      fetch: async () => {
        visitas++;
        return { headers: new Map([['location', 'http://169.254.169.254/latest/meta-data']]) };
      },
    });
    for (const malo of ['https://evil.com/@1,2', 'http://maps.app.goo.gl/x', 'javascript:alert(1)', 'https://localhost/maps']) {
      await assert.rejects(e.resolver(malo), ValidacionError, malo);
    }
    assert.equal(visitas, 0);
    await assert.rejects(e.resolver('https://maps.app.goo.gl/abc'), ValidacionError);
    assert.equal(visitas, 1, 'se cortó al intentar salir de Google');
  });
});

test('el nombre público de una reseña oculta el apellido', () => {
  assert.equal(nombrePublico('Lucía Méndez Torres'), 'Lucía M.');
  assert.equal(nombrePublico('Ana'), 'Ana');
});
