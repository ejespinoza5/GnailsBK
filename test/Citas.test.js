import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DisponibilidadService } from '../src/services/DisponibilidadService.js';
import { CitaService } from '../src/services/CitaService.js';
import { ConflictoError, NoEncontradoError, ReglaNegocioError } from '../src/errors/AppError.js';

// Jueves 15/10/2026 a las 08:00 en el salón. El lunes siguiente es 19/10.
const HOY = '2026-10-15';
const LUNES = '2026-10-19';

const relojFijo = (fecha = HOY, minutos = 8 * 60) => ({ ahora: () => ({ fecha, minutos }) });

/** Repositorios en memoria con la misma interfaz que los reales. */
function armar({ reloj = relojFijo(), config = {}, avisos } = {}) {
  const servicio = { id: 's1', nombre: 'Manicure', duracionMin: 60, precio: 18.5, activo: true, disponibleDesde: null, disponibleHasta: null };
  const profesionales = [
    { id: 'p1', nombre: 'Carla', diasLaborales: [1, 2, 3, 4, 5, 6], activo: true },
    { id: 'p2', nombre: 'Dani', diasLaborales: [2, 4], activo: true },
  ];
  const citas = [];
  const bloqueos = [];
  const configuracion = { intervaloMin: 30, anticipacionMin: 60, diasMaximos: 30, horasCancelacion: 12, maxCitasActivas: 3, ...config };
  const horario = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, abierto: d !== 0, apertura: '09:00', cierre: '13:00' }));

  const servicioRepo = { buscarPorId: async (id) => (id === servicio.id ? { ...servicio } : null) };
  const profesionalRepo = { listarPorServicio: async () => profesionales.filter((p) => p.activo) };
  const agendaRepo = {
    obtenerConfiguracion: async () => configuracion,
    obtenerHorario: async () => horario,
    listarBloqueos: async ({ desde, hasta }) => bloqueos.filter((b) => b.fecha >= desde && b.fecha <= hasta),
  };
  const citaRepo = {
    ocupadas: async ({ desde, hasta, profesionalIds, excluirId }) =>
      citas
        .filter((c) => c.estado !== 'cancelada' && c.fecha >= desde && c.fecha <= hasta && profesionalIds.includes(c.profesionalId) && c.id !== excluirId)
        .map((c) => ({ profesionalId: c.profesionalId, fecha: c.fecha, inicio: c.horaInicio, fin: c.horaFin })),
    contarActivasFuturas: async (clienteId) => citas.filter((c) => c.clienteId === clienteId && c.estado === 'confirmada').length,
    crear: async (c) => {
      const cita = { id: `c${citas.length + 1}`, estado: 'confirmada', ...c };
      citas.push(cita);
      return cita;
    },
    buscarPorId: async (id) => citas.find((c) => c.id === id) ?? null,
    marcarVista: async (id) => {
      const c = citas.find((x) => x.id === id);
      if (c.vistaEn) return false;
      c.vistaEn = new Date();
      return true;
    },
    cambiarEstado: async (id, { estado, estadoActual }) => {
      const c = citas.find((x) => x.id === id);
      if (estadoActual && c.estado !== estadoActual) return null;
      c.estado = estado;
      return c;
    },
  };

  const disponibilidad = new DisponibilidadService({ servicioRepo, profesionalRepo, agendaRepo, citaRepo, reloj });
  const citaService = new CitaService({ citaRepo, agendaRepo, disponibilidadService: disponibilidad, reloj, ...(avisos && { avisos }) });
  return { disponibilidad, citaService, citas, bloqueos, servicio, horario };
}

const horas = (dia) => dia.horarios.map((h) => h.hora);

describe('DisponibilidadService', () => {
  let s;
  beforeEach(() => {
    s = armar();
  });

  test('turnos cada 30 min hasta la hora del último turno (incluida)', async () => {
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: LUNES, dias: 1 });
    assert.deepEqual(horas(dias[0]), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00']);
  });

  test('domingo cerrado y día pasado', async () => {
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: '2026-10-14', dias: 5 });
    assert.equal(dias[0].estado, 'pasado');
    assert.equal(dias.find((d) => d.fecha === '2026-10-18').estado, 'cerrado');
  });

  test('hoy respeta la anticipación mínima (8:00 + 60 min → desde las 9:00)', async () => {
    s = armar({ reloj: relojFijo(HOY, 8 * 60 + 15) });
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: HOY, dias: 1 });
    assert.equal(horas(dias[0])[0], '09:30');
  });

  test('una cita ocupa a la profesional durante toda su duración', async () => {
    s.citas.push({ id: 'x', profesionalId: 'p1', fecha: LUNES, horaInicio: '10:00', horaFin: '11:00', estado: 'confirmada' });
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', profesionalId: 'p1', desde: LUNES, dias: 1 });
    // 09:30 (terminaría 10:30) y 10:30 chocan; 09:00 y 11:00 no.
    assert.deepEqual(horas(dias[0]), ['09:00', '11:00', '11:30', '12:00', '12:30', '13:00']);
  });

  test('las citas canceladas no ocupan', async () => {
    s.citas.push({ id: 'x', profesionalId: 'p1', fecha: LUNES, horaInicio: '10:00', horaFin: '11:00', estado: 'cancelada' });
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', profesionalId: 'p1', desde: LUNES, dias: 1 });
    assert.ok(horas(dias[0]).includes('10:00'));
  });

  test('días laborales y ausencias de cada profesional', async () => {
    const martes = '2026-10-20';
    let { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: LUNES, dias: 2 });
    assert.deepEqual(dias[0].horarios[0].profesionales, ['p1'], 'el lunes Dani no trabaja');
    assert.deepEqual(dias[1].horarios[0].profesionales, ['p1', 'p2']);

    s.bloqueos.push({ fecha: martes, profesionalId: 'p1', motivo: 'Vacaciones' });
    ({ dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: martes, dias: 1 }));
    assert.deepEqual(dias[0].horarios[0].profesionales, ['p2']);
  });

  test('feriado del local con su motivo', async () => {
    s.bloqueos.push({ fecha: LUNES, profesionalId: null, motivo: 'Feriado' });
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: LUNES, dias: 1 });
    assert.equal(dias[0].estado, 'cerrado');
    assert.equal(dias[0].motivo, 'Feriado');
  });

  test('servicio de temporada solo dentro de sus fechas', async () => {
    s.servicio.disponibleDesde = '2026-12-01';
    const { dias } = await s.disponibilidad.calcular({ servicioId: 's1', desde: LUNES, dias: 1 });
    assert.equal(dias[0].estado, 'no_disponible');
  });

  test('profesional que no hace el servicio → 404', async () => {
    await assert.rejects(s.disponibilidad.calcular({ servicioId: 's1', profesionalId: 'otra', desde: LUNES }), NoEncontradoError);
  });
});

describe('CitaService', () => {
  let s;
  beforeEach(() => {
    s = armar();
  });

  test('reserva calculando la hora de fin y guardando el precio', async () => {
    const cita = await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' });
    assert.equal(cita.horaFin, '11:00');
    assert.equal(cita.precio, 18.5);
  });

  test('con "cualquiera" asigna a la profesional con menos trabajo ese día', async () => {
    const martes = '2026-10-20';
    await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: martes, hora: '09:00' });
    const cita = await s.citaService.reservar('bea', { servicioId: 's1', fecha: martes, hora: '11:00' });
    assert.equal(cita.profesionalId, 'p2');
  });

  test('no permite un turno ocupado ni fuera del horario', async () => {
    await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' });
    await assert.rejects(s.citaService.reservar('bea', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:30' }), ConflictoError);
    await assert.rejects(s.citaService.reservar('bea', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '13:30' }), ConflictoError);
  });

  test('si la BDD detecta el cruce (carrera), responde como horario ocupado', async () => {
    s.citaService.citaRepo.crear = async () => {
      throw Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' });
    };
    await assert.rejects(
      s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' }),
      (e) => e instanceof ConflictoError && e.codigo === 'HORARIO_OCUPADO',
    );
  });

  test('límite de citas activas por clienta', async () => {
    s = armar({ config: { maxCitasActivas: 1 } });
    await s.citaService.reservar('ana', { servicioId: 's1', fecha: LUNES, hora: '09:00' });
    await assert.rejects(
      s.citaService.reservar('ana', { servicioId: 's1', fecha: LUNES, hora: '11:00' }),
      (e) => e instanceof ReglaNegocioError && e.codigo === 'LIMITE_CITAS',
    );
  });

  test('cancelar: solo la dueña de la cita y dentro del plazo', async () => {
    const cita = await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' });
    await assert.rejects(s.citaService.cancelarPorCliente('bea', cita.id), NoEncontradoError);

    const tarde = armar({ reloj: relojFijo(LUNES, 9 * 60) }); // falta 1 h; el plazo es 12 h
    const c2 = await tarde.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '11:00' }).catch(() => null);
    tarde.citas.push({ id: 'z', clienteId: 'ana', profesionalId: 'p1', fecha: LUNES, horaInicio: '10:00', horaFin: '11:00', estado: 'confirmada' });
    await assert.rejects(tarde.citaService.cancelarPorCliente('ana', 'z'), (e) => e.codigo === 'FUERA_DE_PLAZO');
    assert.ok(c2, 'la reserva de las 11:00 sí era posible');

    const cancelada = await s.citaService.cancelarPorCliente('ana', cita.id);
    assert.equal(cancelada.estado, 'cancelada');
  });
});

describe('Cita vista por el salón', () => {
  const admin = { rol: 'admin', usuarioId: 'duena' };

  test('avisa a la clienta una sola vez que su turno está asegurado', async () => {
    const vistas = [];
    const s = armar({ avisos: { reservada: async () => {}, vista: async (cita) => vistas.push(cita.id) } });
    const cita = await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' });
    await s.citaService.marcarVista(admin, cita.id);
    await s.citaService.marcarVista(admin, cita.id);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(vistas, [cita.id]);
    assert.ok(s.citas[0].vistaEn);
  });

  test('una profesional no puede marcar citas de otra', async () => {
    const s = armar();
    const cita = await s.citaService.reservar('ana', { servicioId: 's1', profesionalId: 'p1', fecha: LUNES, hora: '10:00' });
    await assert.rejects(s.citaService.marcarVista({ rol: 'profesional', usuarioId: 'u2', profesionalId: 'p2' }, cita.id), NoEncontradoError);
  });

  test('una cita que ya pasó se marca sin avisar', async () => {
    const vistas = [];
    const s = armar({ reloj: relojFijo('2026-10-20', 9 * 60), avisos: { vista: async (c) => vistas.push(c.id) } });
    s.citas.push({ id: 'vieja', clienteId: 'ana', profesionalId: 'p1', fecha: LUNES, horaInicio: '10:00', horaFin: '11:00', estado: 'confirmada' });
    await s.citaService.marcarVista(admin, 'vieja');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(vistas, []);
  });
});
