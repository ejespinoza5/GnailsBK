import { ConflictoError, NoEncontradoError } from '../errors/AppError.js';

/** Responsabilidad única: el catálogo de servicios del local. */
export class ServicioService {
  constructor({ servicioRepo, reloj }) {
    this.servicioRepo = servicioRepo;
    this.reloj = reloj;
  }

  listar() {
    return this.servicioRepo.listar();
  }

  listarReservables() {
    return this.servicioRepo.listarReservables(this.reloj.ahora().fecha);
  }

  crear(datos) {
    return this.servicioRepo.crear(datos);
  }

  async actualizar(id, datos) {
    const servicio = await this.servicioRepo.actualizar(id, datos);
    if (!servicio) throw new NoEncontradoError('No encontramos este servicio');
    return servicio;
  }

  /** Con citas en el historial no se borra (se perdería el registro): se desactiva. */
  async eliminar(id) {
    if (await this.servicioRepo.tieneCitas(id)) {
      throw new ConflictoError('Este servicio tiene citas registradas. Desactívalo para que ya no se pueda reservar.');
    }
    if (!(await this.servicioRepo.eliminar(id))) throw new NoEncontradoError('No encontramos este servicio');
  }
}
