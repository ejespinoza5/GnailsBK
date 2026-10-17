import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { limiteGeneral, verificarOrigen } from './middlewares/seguridad.js';
import { noEncontrado, crearManejadorErrores } from './middlewares/errores.js';
import { crearAuthRoutes } from './routes/auth.routes.js';
import { crearReservasRoutes } from './routes/reservas.routes.js';
import { crearAdminRoutes } from './routes/admin.routes.js';
import { crearPublicoRoutes } from './routes/publico.routes.js';
import { crearResenasRoutes } from './routes/resenas.routes.js';
import { crearAgendaRoutes } from './routes/agenda.routes.js';
import { crearNotificacionesRoutes } from './routes/notificaciones.routes.js';
import { validar } from './middlewares/validar.js';
import { esquemaParamId } from './validators/citas.validator.js';

/** Arma la app de Express con las dependencias que recibe del contenedor. */
export function crearApp(contenedor) {
  const app = express();

  // Necesario detrás de un proxy (Nginx, Render, Railway...) para leer la IP real.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.origenesPermitidos,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use('/api', limiteGeneral);
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(verificarOrigen);
  app.use(contenedor.autenticar);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', crearAuthRoutes(contenedor));
  app.use('/api/publico', crearPublicoRoutes(contenedor));
  app.use('/api/resenas', crearResenasRoutes(contenedor));
  app.use('/api/agenda', crearAgendaRoutes(contenedor));
  app.use('/api/notificaciones', crearNotificacionesRoutes(contenedor));
  app.use('/api/admin', crearAdminRoutes(contenedor));
  app.get('/api/avatares/:id', contenedor.requiereSesion, validar(esquemaParamId, 'params'), contenedor.cuentaController.avatar);
  app.use('/api', crearReservasRoutes(contenedor));

  app.use(noEncontrado);
  app.use(crearManejadorErrores(contenedor));

  return app;
}
