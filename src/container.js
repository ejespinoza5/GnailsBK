import { env } from './config/env.js';
import { pool } from './db/pool.js';

import { UsuarioRepository } from './repositories/UsuarioRepository.js';
import { SesionRepository } from './repositories/SesionRepository.js';
import { ServicioRepository } from './repositories/ServicioRepository.js';
import { ProfesionalRepository } from './repositories/ProfesionalRepository.js';
import { AgendaRepository } from './repositories/AgendaRepository.js';
import { CitaRepository } from './repositories/CitaRepository.js';
import { AvatarRepository } from './repositories/AvatarRepository.js';
import { RecuperacionRepository } from './repositories/RecuperacionRepository.js';
import { VerificacionRepository } from './repositories/VerificacionRepository.js';
import { SitioRepository } from './repositories/SitioRepository.js';
import { ResenaRepository } from './repositories/ResenaRepository.js';
import { NotificacionRepository } from './repositories/NotificacionRepository.js';
import { CampanaRepository } from './repositories/CampanaRepository.js';

import { PasswordHasher } from './services/PasswordHasher.js';
import { TokenService } from './services/TokenService.js';
import { GoogleVerifier } from './services/GoogleVerifier.js';
import { SesionService } from './services/SesionService.js';
import { AuthService } from './services/AuthService.js';
import { ServicioService } from './services/ServicioService.js';
import { ProfesionalService } from './services/ProfesionalService.js';
import { AgendaService } from './services/AgendaService.js';
import { DisponibilidadService } from './services/DisponibilidadService.js';
import { CitaService } from './services/CitaService.js';
import { CorreoService } from './services/CorreoService.js';
import { ProcesadorImagen } from './services/ProcesadorImagen.js';
import { RecuperacionService } from './services/RecuperacionService.js';
import { CuentaService } from './services/CuentaService.js';
import { VerificacionService } from './services/VerificacionService.js';
import { SitioService } from './services/SitioService.js';
import { ResenaService } from './services/ResenaService.js';
import { EnlaceMapas } from './services/EnlaceMapas.js';
import { CacheMemoria } from './utils/CacheMemoria.js';
import { EnviadorPush } from './services/EnviadorPush.js';
import { NotificacionService } from './services/NotificacionService.js';
import { AvisosCitas } from './services/AvisosCitas.js';
import { CampanaService } from './services/CampanaService.js';
import { ProgramadorNotificaciones } from './services/ProgramadorNotificaciones.js';
import { Reloj } from './utils/tiempo.js';

import { CookieManager } from './http/CookieManager.js';
import { AuthController } from './controllers/AuthController.js';
import { ReservaController } from './controllers/ReservaController.js';
import { ServicioController } from './controllers/ServicioController.js';
import { ProfesionalController } from './controllers/ProfesionalController.js';
import { AgendaController } from './controllers/AgendaController.js';
import { AgendaEquipoController } from './controllers/AgendaEquipoController.js';
import { CuentaController } from './controllers/CuentaController.js';
import { VerificacionController } from './controllers/VerificacionController.js';
import { SitioController } from './controllers/SitioController.js';
import { ResenaController } from './controllers/ResenaController.js';
import { NotificacionController } from './controllers/NotificacionController.js';
import { CampanaController } from './controllers/CampanaController.js';
import { crearMiddlewaresAuth } from './middlewares/auth.js';

/**
 * Raíz de composición: el ÚNICO lugar donde se crean las instancias y se
 * conectan entre sí (inyección de dependencias). Ninguna otra clase hace
 * "new" de sus dependencias, así cada pieza se puede reemplazar o probar
 * por separado (por ejemplo, pasar un repositorio falso en un test).
 */
export function crearContenedor() {
  // ---- Repositorios (acceso a datos)
  const usuarioRepo = new UsuarioRepository(pool);
  const sesionRepo = new SesionRepository(pool);
  const servicioRepo = new ServicioRepository(pool);
  const profesionalRepo = new ProfesionalRepository(pool);
  const agendaRepo = new AgendaRepository(pool);
  const citaRepo = new CitaRepository(pool);
  const avatarRepo = new AvatarRepository(pool);
  const recuperacionRepo = new RecuperacionRepository(pool);
  const verificacionRepo = new VerificacionRepository(pool);
  const sitioRepo = new SitioRepository(pool);
  const resenaRepo = new ResenaRepository(pool);
  const notificacionRepo = new NotificacionRepository(pool);
  const campanaRepo = new CampanaRepository(pool);

  // ---- Servicios (lógica de negocio)
  const hasher = new PasswordHasher();
  const tokenService = new TokenService({
    secreto: env.JWT_SECRET,
    accessMinutos: env.ACCESS_MINUTES,
    refreshDias: env.REFRESH_DAYS,
  });
  const googleVerifier = new GoogleVerifier({ clientId: env.GOOGLE_CLIENT_ID });
  const sesionService = new SesionService({ sesionRepo, usuarioRepo, tokenService });
  const authService = new AuthService({ usuarioRepo, hasher, googleVerifier });

  const reloj = new Reloj(env.ZONA_HORARIA);

  // Notificaciones: bandeja + push (Firebase). Se crean antes porque las citas avisan al cambiar.
  const notificacionService = new NotificacionService({
    notificacionRepo,
    enviadorPush: new EnviadorPush({ credenciales: env.firebase, appUrl: env.appUrl }),
  });
  const avisos = new AvisosCitas({ notificacionService, notificacionRepo, profesionalRepo, agendaRepo });
  const campanaService = new CampanaService({ campanaRepo, notificacionRepo, notificacionService, zonaHoraria: env.ZONA_HORARIA });
  const programadorNotificaciones = new ProgramadorNotificaciones({
    notificacionRepo,
    notificacionService,
    campanaService,
    agendaRepo,
    zonaHoraria: env.ZONA_HORARIA,
  });
  const servicioService = new ServicioService({ servicioRepo, reloj });
  const profesionalService = new ProfesionalService({ profesionalRepo, servicioRepo, usuarioRepo });
  const agendaService = new AgendaService({ agendaRepo, citaRepo, profesionalRepo, servicioRepo });
  const disponibilidadService = new DisponibilidadService({ servicioRepo, profesionalRepo, agendaRepo, citaRepo, reloj });
  const citaService = new CitaService({ citaRepo, agendaRepo, usuarioRepo, disponibilidadService, reloj, avisos });

  const correoService = new CorreoService({ smtp: env.smtp, remitente: env.CORREO_REMITENTE, appUrl: env.appUrl });
  const verificacionService = new VerificacionService({
    usuarioRepo,
    verificacionRepo,
    correoService,
    secreto: env.JWT_SECRET,
  });
  const recuperacionService = new RecuperacionService({ usuarioRepo, recuperacionRepo, hasher, sesionService, correoService });
  const procesadorImagen = new ProcesadorImagen();
  const cacheLanding = new CacheMemoria({ ms: 60_000 });
  const sitioService = new SitioService({
    sitioRepo,
    servicioRepo,
    agendaRepo,
    resenaRepo,
    disponibilidadService,
    procesadorImagen,
    enlaceMapas: new EnlaceMapas(),
    reloj,
    cache: cacheLanding,
  });
  const resenaService = new ResenaService({ resenaRepo, cache: cacheLanding, avisos });
  const cuentaService = new CuentaService({
    usuarioRepo,
    avatarRepo,
    sesionRepo,
    hasher,
    procesadorImagen,
    correoService,
  });

  // ---- Capa HTTP
  const cookies = new CookieManager({
    esProduccion: env.esProduccion,
    accessMs: tokenService.accessMs,
    refreshMs: tokenService.refreshMs,
  });
  const authController = new AuthController({ authService, sesionService, verificacionService, cookies });
  const reservaController = new ReservaController({ servicioService, profesionalService, disponibilidadService, citaService });
  const servicioController = new ServicioController({ servicioService });
  const profesionalController = new ProfesionalController({ profesionalService });
  const agendaController = new AgendaController({ agendaService });
  const agendaEquipoController = new AgendaEquipoController({ citaService, agendaService, disponibilidadService, usuarioRepo });
  const cuentaController = new CuentaController({ cuentaService, recuperacionService, cookies });
  const verificacionController = new VerificacionController({ verificacionService, authService });
  const sitioController = new SitioController({ sitioService });
  const resenaController = new ResenaController({ resenaService });
  const notificacionController = new NotificacionController({ notificacionService });
  const campanaController = new CampanaController({ campanaService });
  const middlewaresAuth = crearMiddlewaresAuth({ tokenService, cookies, usuarioRepo, profesionalRepo });

  return {
    db: pool,
    cookies,
    sesionService,
    recuperacionService,
    verificacionService,
    authController,
    cuentaController,
    verificacionController,
    sitioController,
    resenaController,
    notificacionController,
    campanaController,
    programadorNotificaciones,
    reservaController,
    servicioController,
    profesionalController,
    agendaController,
    agendaEquipoController,
    ...middlewaresAuth, // autenticar, requiereSesion, requiereRol
  };
}
