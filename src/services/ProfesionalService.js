import { ConflictoError, NoEncontradoError, ReglaNegocioError, ValidacionError } from '../errors/AppError.js';

/** Responsabilidad única: el equipo de profesionales y qué servicios hace cada una. */
export class ProfesionalService {
  constructor({ profesionalRepo, servicioRepo, usuarioRepo }) {
    this.profesionalRepo = profesionalRepo;
    this.servicioRepo = servicioRepo;
    this.usuarioRepo = usuarioRepo;
  }

  listar() {
    return this.profesionalRepo.listar();
  }

  listarPorServicio(servicioId) {
    return this.profesionalRepo.listarPorServicio(servicioId);
  }

  async crear(datos) {
    await this.#validarServicios(datos.servicios);
    return this.profesionalRepo.crear(datos);
  }

  async actualizar(id, datos) {
    await this.#validarServicios(datos.servicios);
    const profesional = await this.profesionalRepo.actualizar(id, datos);
    if (!profesional) throw new NoEncontradoError('No encontramos a esta profesional');
    return profesional;
  }

  async eliminar(id) {
    if (await this.profesionalRepo.tieneCitas(id)) {
      throw new ConflictoError('Esta profesional tiene citas registradas. Desactívala para que ya no reciba reservas.');
    }
    await this.quitarAcceso(id);
    if (!(await this.profesionalRepo.eliminar(id))) throw new NoEncontradoError('No encontramos a esta profesional');
  }

  /**
   * Da acceso a la app a una profesional usando la cuenta que ella creó (registro normal).
   * La cuenta pasa a rol "profesional" y solo verá su propia agenda.
   * Si la cuenta es de la dueña (admin), conserva su rol: ya ve todo.
   */
  async darAcceso(profesionalId, email) {
    const profesional = await this.profesionalRepo.buscarPorId(profesionalId);
    if (!profesional) throw new NoEncontradoError('No encontramos a esta profesional');

    const usuario = await this.usuarioRepo.buscarPorEmail(email);
    if (!usuario?.activo) {
      throw new ValidacionError(
        { email: 'No hay ninguna cuenta con ese correo. Pídele que se registre primero en la app.' },
        'No hay ninguna cuenta con ese correo',
      );
    }
    if (!usuario.emailVerificado) {
      throw new ReglaNegocioError('Esa cuenta todavía no confirmó su correo. Pídele que entre y escriba el código que le llegó.');
    }
    const otra = await this.profesionalRepo.buscarPorUsuario(usuario.id);
    if (otra && otra.id !== profesionalId) {
      throw new ConflictoError(`Esa cuenta ya está vinculada a ${otra.nombre}.`, { email: `Ya está vinculada a ${otra.nombre}` });
    }

    // Si tenía otra cuenta vinculada, esa pierde el acceso.
    if (profesional.cuenta && profesional.cuenta.id !== usuario.id) await this.quitarAcceso(profesionalId);

    if (usuario.rol === 'cliente') await this.usuarioRepo.actualizarRol(usuario.id, 'profesional');
    return this.profesionalRepo.vincularUsuario(profesionalId, usuario.id);
  }

  /** Quita el acceso: la cuenta vuelve a ser de clienta (sus datos y citas se conservan). */
  async quitarAcceso(profesionalId) {
    const profesional = await this.profesionalRepo.buscarPorId(profesionalId);
    if (!profesional) throw new NoEncontradoError('No encontramos a esta profesional');
    if (!profesional.cuenta) return profesional;

    const usuario = await this.usuarioRepo.buscarPorId(profesional.cuenta.id);
    const actualizada = await this.profesionalRepo.vincularUsuario(profesionalId, null);
    if (usuario?.rol === 'profesional') await this.usuarioRepo.actualizarRol(usuario.id, 'cliente');
    return actualizada;
  }

  async #validarServicios(ids) {
    if (ids.length && (await this.servicioRepo.contarExistentes(ids)) !== ids.length) {
      throw new ValidacionError({ servicios: 'Alguno de los servicios ya no existe. Recarga la página.' });
    }
  }
}
