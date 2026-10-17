/**
 * Utilidades de fechas y horas del salón. Las fechas viajan como texto
 * 'YYYY-MM-DD' y las horas como 'HH:MM' (hora local del salón): así no hay
 * conversiones de zona horaria que corran una cita de día.
 */

/** '09:30' → 570 */
export function aMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** 570 → '09:30' */
export function aHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** '2026-10-15' + 3 → '2026-10-18' */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(fecha) {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

/** Días entre dos fechas (b - a). */
export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Minutos desde "ahora" hasta el inicio de (fecha, hora). Negativo si ya pasó. */
export function minutosHasta(ahora, fecha, hora) {
  return diasEntre(ahora.fecha, fecha) * 1440 + aMinutos(hora) - ahora.minutos;
}

/** Recorta 'HH:MM:SS' (como lo devuelve PostgreSQL) a 'HH:MM'. */
export function horaCorta(hora) {
  return hora ? hora.slice(0, 5) : hora;
}

/**
 * Da la fecha y la hora actuales en la zona horaria del salón.
 * Se inyecta en los servicios para poder fijar "ahora" en las pruebas.
 */
export class Reloj {
  constructor(zonaHoraria) {
    this.formato = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }

  /** @returns {{ fecha: string, minutos: number }} */
  ahora() {
    const p = Object.fromEntries(this.formato.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
  }
}

// ---------- Textos de los avisos (notificaciones)

const fAviso = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

/**
 * '2026-10-19' → 'el lunes 19 de octubre'. Con `hoy` dice «hoy» o «mañana» cuando corresponde.
 * `mayuscula` para empezar una oración.
 */
export function fechaParaAviso(fecha, { hoy = null, mayuscula = false } = {}) {
  let texto = `el ${fAviso.format(new Date(`${fecha}T00:00:00Z`)).replace(',', '')}`;
  if (hoy && fecha === hoy) texto = 'hoy';
  else if (hoy && fecha === sumarDias(hoy, 1)) texto = 'mañana';
  return mayuscula ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

/** '14:30' → '2:30 p. m.' */
export function horaParaAviso(hora) {
  const [h, m] = hora.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
