import { ValidacionError } from '../errors/AppError.js';

/**
 * Valida y limpia una parte de la petición con un esquema de zod antes de
 * llegar al controlador.
 *   validar(esquema)            → req.body (se reemplaza por los datos limpios)
 *   validar(esquema, 'query')   → req.valido.query
 *   validar(esquema, 'params')  → req.valido.params
 * (En Express 5 req.query es de solo lectura, por eso se guarda en req.valido.)
 */
export function validar(esquema, fuente = 'body') {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req[fuente] ?? {});
    if (!resultado.success) throw new ValidacionError(erroresPorCampo(resultado.error));
    req.valido ??= {};
    req.valido[fuente] = resultado.data;
    if (fuente === 'body') req.body = resultado.data; // datos ya normalizados (trim, minúsculas, etc.)
    next();
  };
}

/** Convierte los errores de zod en { campo: 'mensaje' } para el frontend. */
function erroresPorCampo(error) {
  const salida = {};
  for (const issue of error.issues) {
    const campo = issue.path[0] ?? 'general';
    salida[campo] ??= issue.code === 'unrecognized_keys' ? 'La petición contiene campos no permitidos' : issue.message;
  }
  return salida;
}
