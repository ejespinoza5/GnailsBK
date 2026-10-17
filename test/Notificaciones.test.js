import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProgramadorNotificaciones, umbralRecordatorio } from '../src/services/ProgramadorNotificaciones.js';
import { AvisosCitas } from '../src/services/AvisosCitas.js';
import { NotificacionService } from '../src/services/NotificacionService.js';
import { loggerSilencioso } from './fakes.js';

const vieja = { minutosDesdeCreada: 600, anticipacion: 3000 };

describe('umbralRecordatorio', () => {
  test('30, 15 y 5 minutos antes', () => {
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 29.6 }), 30);
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 14.9 }), 15);
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 4.2 }), 5);
  });

  test('si el servidor estuvo caído, solo el umbral más cercano (no los tres juntos)', () => {
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 3 }), 5);
  });

  test('día anterior solo si reservó con 24 h de anticipación', () => {
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 1200 }), 1440);
    assert.equal(umbralRecordatorio({ minutos: 1200, minutosDesdeCreada: 100, anticipacion: 1300 }), null);
  });

  test('no recuerda una cita recién creada ni una que ya empezó', () => {
    assert.equal(umbralRecordatorio({ minutos: 25, minutosDesdeCreada: 3, anticipacion: 28 }), null);
    assert.equal(umbralRecordatorio({ ...vieja, minutos: -1 }), null);
    assert.equal(umbralRecordatorio({ ...vieja, minutos: 2000 }), null);
  });
});

/** Repositorio en memoria con lo que usan el programador y los avisos. */
function repoFalso({ citas = [], admins = ['dueña'], preferencias = {} } = {}) {
  const reclamados = new Set();
  return {
    bandeja: [],
    citasProximas: async () => citas,
    reclamarRecordatorio: async (id, u) => !reclamados.has(`${id}:${u}`) && Boolean(reclamados.add(`${id}:${u}`)),
    crearParaVarios: async function (ids, aviso) {
      for (const id of ids) this.bandeja.push({ id, ...aviso });
      return ids.length;
    },
    tokensDe: async () => [],
    eliminarTokens: async () => {},
    filtrarPorPreferencia: async (ids) => ids.filter((id) => preferencias[id] !== false),
    idsAdministradoras: async () => admins,
  };
}

const sinPush = { activo: false, enviar: async (t) => ({ entregados: t.length, invalidos: [] }) };

describe('ProgramadorNotificaciones', () => {
  test('envía cada recordatorio una sola vez y respeta si la clienta los apagó', async () => {
    const citas = [
      { id: 'c1', clienteId: 'ana', fecha: '2026-10-19', hora: '10:00', servicio: 'Manicure', profesional: 'Carla', minutos: 29.5, ...vieja },
      { id: 'c2', clienteId: 'bea', fecha: '2026-10-19', hora: '10:00', servicio: 'Manicure', profesional: 'Dani', minutos: 14.5, ...vieja },
    ];
    const repo = repoFalso({ citas, preferencias: { bea: false } });
    const notificacionService = new NotificacionService({ notificacionRepo: repo, enviadorPush: sinPush, logger: loggerSilencioso });
    const p = new ProgramadorNotificaciones({
      notificacionRepo: repo,
      notificacionService,
      campanaService: { procesarPendientes: async () => 0 },
      zonaHoraria: 'America/Guayaquil',
      logger: loggerSilencioso,
    });

    await p.revisar();
    await p.revisar(); // segunda vuelta: no debe repetir

    assert.equal(repo.bandeja.length, 1);
    assert.equal(repo.bandeja[0].id, 'ana');
    assert.equal(repo.bandeja[0].titulo, 'Tu cita es en 30 minutos');
  });
});

describe('AvisosCitas', () => {
  const cita = {
    id: 'x',
    clienteId: 'ana',
    clienteNombre: 'Ana',
    profesionalId: 'p1',
    profesionalNombre: 'Carla',
    servicioNombre: 'Manicure',
    fecha: '2026-10-19',
    horaInicio: '10:00',
  };
  const armar = (cuentaProfesional = 'carla') => {
    const repo = repoFalso();
    const notificacionService = new NotificacionService({ notificacionRepo: repo, enviadorPush: sinPush, logger: loggerSilencioso });
    const avisos = new AvisosCitas({
      notificacionService,
      notificacionRepo: repo,
      profesionalRepo: { buscarPorId: async () => ({ cuenta: cuentaProfesional ? { id: cuentaProfesional } : null }) },
    });
    return { repo, avisos };
  };

  test('cita nueva: avisa a la clienta, la dueña y la profesional (cada una con su enlace)', async () => {
    const { repo, avisos } = armar();
    await avisos.reservada(cita, 'ana');
    const para = (id) => repo.bandeja.filter((n) => n.id === id);
    assert.equal(para('ana')[0].titulo, 'Tu cita está confirmada', 'la clienta recibe su confirmación aunque haya reservado ella');
    assert.equal(para('dueña')[0].url, '/admin?fecha=2026-10-19');
    assert.equal(para('carla')[0].url, '/equipo?fecha=2026-10-19');
  });

  test('si la agenda el salón, la clienta recibe la confirmación', async () => {
    const { repo, avisos } = armar();
    await avisos.reservada(cita, 'dueña');
    assert.equal(repo.bandeja.find((n) => n.id === 'ana').titulo, 'Tu cita está confirmada');
    assert.ok(!repo.bandeja.some((n) => n.id === 'dueña'));
  });

  test('si la dueña también es la profesional, recibe un solo aviso', async () => {
    const { repo, avisos } = armar('dueña');
    await avisos.reservada(cita, 'ana');
    assert.equal(repo.bandeja.filter((n) => n.id === 'dueña').length, 1);
  });

  test('cancelación de la clienta: avisa a la dueña y a la profesional, no a la clienta', async () => {
    const { repo, avisos } = armar();
    await avisos.cancelada(cita, 'ana', { porCliente: true });
    assert.deepEqual(repo.bandeja.map((n) => n.id).sort(), ['carla', 'dueña']);
  });
});
