/**
 * Errores de la aplicación. Los servicios lanzan estos errores sin saber nada de
 * HTTP; el middleware de errores es el único que los traduce a respuestas.
 */
export class AppError extends Error {
  constructor(mensaje, status = 500, { codigo, campos } = {}) {
    super(mensaje);
    this.name = this.constructor.name;
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export class ValidacionError extends AppError {
  constructor(campos, mensaje = 'Revisa los datos del formulario') {
    super(mensaje, 400, { campos });
  }
}

export class NoAutenticadoError extends AppError {
  constructor(mensaje = 'Debes iniciar sesión', codigo = 'NO_AUTENTICADO') {
    super(mensaje, 401, { codigo });
  }
}

export class TokenExpiradoError extends NoAutenticadoError {
  constructor() {
    super('Tu sesión necesita renovarse', 'TOKEN_EXPIRADO');
  }
}

export class SesionExpiradaError extends NoAutenticadoError {
  constructor() {
    super('Tu sesión expiró. Inicia sesión de nuevo.', 'SESION_EXPIRADA');
  }
}

export class ProhibidoError extends AppError {
  constructor(mensaje = 'No tienes permiso para esto') {
    super(mensaje, 403);
  }
}

export class NoEncontradoError extends AppError {
  constructor(mensaje = 'No encontramos lo que buscas') {
    super(mensaje, 404);
  }
}

export class ConflictoError extends AppError {
  constructor(mensaje, campos, codigo) {
    super(mensaje, 409, { campos, codigo });
  }
}

/** La petición es válida pero rompe una regla del negocio (horario cerrado, límite de citas...). */
export class ReglaNegocioError extends AppError {
  constructor(mensaje, codigo) {
    super(mensaje, 422, { codigo });
  }
}

export class DemasiadosIntentosError extends AppError {
  constructor(mensaje) {
    super(mensaje, 429);
  }
}
