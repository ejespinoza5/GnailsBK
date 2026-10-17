import { env } from './config/env.js';
import { crearContenedor } from './container.js';
import { crearApp } from './app.js';

async function iniciar() {
  const contenedor = crearContenedor();

  try {
    await contenedor.db.query('SELECT 1');
    console.log('✅ Conectado a PostgreSQL');
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  // Limpieza de sesiones vencidas cada hora.
  setInterval(
    () => {
      contenedor.sesionService.limpiarVencidas().catch((e) => console.error('Limpieza de sesiones:', e.message));
      contenedor.recuperacionService.limpiarVencidas().catch((e) => console.error('Limpieza de enlaces:', e.message));
      contenedor.verificacionService.limpiarVencidos().catch((e) => console.error('Limpieza de códigos:', e.message));
    },
    60 * 60 * 1000,
  ).unref();

  // Recordatorios de citas y promociones programadas
  contenedor.programadorNotificaciones.iniciar(env.NOTIFICACIONES_INTERVALO_S);

  crearApp(contenedor).listen(env.PORT, () => {
    console.log(`🚀 API Geovys Nails escuchando en http://localhost:${env.PORT}`);
  });
}

iniciar();
