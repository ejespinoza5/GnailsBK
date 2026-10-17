import { NoEncontradoError, ReglaNegocioError, ValidacionError } from '../errors/AppError.js';
import { servicioAPublico } from '../mappers/citas.mapper.js';

const MAX_GALERIA = 60;

const urlFoto = (f, mini = false) => `/api/publico/fotos/${f.id}?v=${f.version}${mini ? '&t=mini' : ''}`;

/** Nombre público de quien opina: "Lucía Méndez" → "Lucía M." (no se publica el apellido completo). */
export function nombrePublico(nombre = '') {
  const [primero, segundo] = nombre.trim().split(/\s+/);
  return segundo ? `${primero} ${segundo[0].toUpperCase()}.` : primero;
}

/**
 * Responsabilidad única: el contenido de la página pública
 * (textos de portada, fotos, ubicación y contacto) y armar los datos de la landing.
 */
export class SitioService {
  constructor({ sitioRepo, servicioRepo, agendaRepo, resenaRepo, disponibilidadService, procesadorImagen, enlaceMapas, reloj, cache }) {
    this.sitioRepo = sitioRepo;
    this.servicioRepo = servicioRepo;
    this.agendaRepo = agendaRepo;
    this.resenaRepo = resenaRepo;
    this.disponibilidad = disponibilidadService;
    this.imagenes = procesadorImagen;
    this.mapas = enlaceMapas;
    this.reloj = reloj;
    this.cache = cache;
  }

  // ---------------------------------------------------------- Landing (pública)

  landing() {
    return this.cache.obtener(async () => {
      const hoy = this.reloj.ahora().fecha;
      const [sitio, portada, galeria, servicios, horario, resumen, resenas] = await Promise.all([
        this.sitioRepo.obtener(),
        this.sitioRepo.listarFotos('portada'),
        this.sitioRepo.listarFotos('galeria', { soloVisibles: true }),
        this.servicioRepo.listarReservables(hoy),
        this.agendaRepo.obtenerHorario(),
        this.resenaRepo.resumenPublico(),
        this.resenaRepo.publicas(24),
      ]);

      return {
        sitio,
        portada: portada[0] ? { url: urlFoto(portada[0]), ancho: portada[0].ancho, alto: portada[0].alto } : null,
        galeria: galeria.map((f) => ({ id: f.id, titulo: f.titulo, ancho: f.ancho, alto: f.alto, url: urlFoto(f), miniatura: urlFoto(f, true) })),
        servicios: servicios.map(servicioAPublico),
        horario,
        resenas: {
          total: resumen.total,
          promedio: Math.round(resumen.promedio * 10) / 10,
          lista: resenas.map((r) => ({
            id: r.id,
            nombre: nombrePublico(r.nombre),
            calificacion: r.calificacion,
            comentario: r.comentario,
            respuesta: r.respuesta,
            fecha: r.creadoEn,
          })),
        },
        proximosTurnos: await this.#proximosTurnos(servicios, hoy),
      };
    });
  }

  /** Los próximos 4 turnos libres del servicio más corto: la prueba viva de que se puede reservar ya. */
  async #proximosTurnos(servicios, hoy) {
    if (!servicios.length) return null;
    const servicio = [...servicios].sort((a, b) => a.duracionMin - b.duracionMin)[0];
    try {
      const { dias } = await this.disponibilidad.calcular({ servicioId: servicio.id, desde: hoy, dias: 14 });
      const turnos = dias.flatMap((d) => d.horarios.map((h) => ({ fecha: d.fecha, hora: h.hora }))).slice(0, 4);
      return { servicio: { id: servicio.id, nombre: servicio.nombre }, turnos };
    } catch {
      return null;
    }
  }

  async archivoFoto(id, miniatura) {
    const datos = await this.sitioRepo.obtenerArchivo(id, { miniatura });
    if (!datos) throw new NoEncontradoError('Foto no encontrada');
    return datos;
  }

  // ---------------------------------------------------------- Administración

  async contenido() {
    const [sitio, portada, galeria] = await Promise.all([
      this.sitioRepo.obtener(),
      this.sitioRepo.listarFotos('portada'),
      this.sitioRepo.listarFotos('galeria'),
    ]);
    // La administradora ve también las fotos ocultas: se le sirven por la ruta de admin.
    const urlAdmin = (f, mini) => `/api/admin/sitio/fotos/${f.id}?v=${f.version}${mini ? '&t=mini' : ''}`;
    return {
      sitio,
      portada: portada[0] ? { ...portada[0], url: urlAdmin(portada[0]), miniatura: urlAdmin(portada[0], true) } : null,
      galeria: galeria.map((f) => ({ ...f, url: urlAdmin(f), miniatura: urlAdmin(f, true) })),
    };
  }

  async archivoFotoAdmin(id, miniatura) {
    const datos = await this.sitioRepo.obtenerArchivo(id, { miniatura, incluirOcultas: true });
    if (!datos) throw new NoEncontradoError('Foto no encontrada');
    return datos;
  }

  async guardarTextos(datos) {
    const r = await this.sitioRepo.guardarTextos(datos);
    this.cache.invalidar();
    return r;
  }

  async guardarUbicacion(datos) {
    const r = await this.sitioRepo.guardarUbicacion(datos);
    this.cache.invalidar();
    return r;
  }

  resolverMapa(enlace) {
    return this.mapas.resolver(enlace);
  }

  async subirPortada(buffer) {
    const foto = await this.imagenes.fotoSitio(buffer, { anchoMax: 2400, miniatura: 900, calidad: 78 });
    await this.sitioRepo.reemplazarPortada(foto);
    this.cache.invalidar();
  }

  async quitarPortada() {
    const [portada] = await this.sitioRepo.listarFotos('portada');
    if (portada) await this.sitioRepo.eliminarFoto(portada.id, 'portada');
    this.cache.invalidar();
  }

  async subirFotoGaleria(buffer, titulo) {
    if ((await this.sitioRepo.contarGaleria()) >= MAX_GALERIA) {
      throw new ReglaNegocioError(`La galería admite hasta ${MAX_GALERIA} fotos. Elimina alguna para subir otra.`);
    }
    const foto = await this.imagenes.fotoSitio(buffer);
    const r = await this.sitioRepo.agregarFoto({ tipo: 'galeria', ...foto, titulo });
    this.cache.invalidar();
    return r;
  }

  async actualizarFoto(id, datos) {
    const r = await this.sitioRepo.actualizarFoto(id, datos);
    if (!r) throw new NoEncontradoError('Foto no encontrada');
    this.cache.invalidar();
    return r;
  }

  async ordenarGaleria(ids) {
    const actuales = await this.sitioRepo.listarFotos('galeria');
    const existentes = new Set(actuales.map((f) => f.id));
    if (ids.length !== existentes.size || !ids.every((id) => existentes.has(id))) {
      throw new ValidacionError({ ids: 'La lista de fotos cambió. Recarga la página.' });
    }
    await this.sitioRepo.ordenarGaleria(ids);
    this.cache.invalidar();
  }

  async eliminarFoto(id) {
    if (!(await this.sitioRepo.eliminarFoto(id, 'galeria'))) throw new NoEncontradoError('Foto no encontrada');
    this.cache.invalidar();
  }
}
