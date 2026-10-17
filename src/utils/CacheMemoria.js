/**
 * Caché en memoria con vencimiento. La landing la visita todo el mundo: así no
 * se consulta la BDD en cada visita. Al editar algo desde el panel se invalida.
 */
export class CacheMemoria {
  constructor({ ms = 60_000 } = {}) {
    this.ms = ms;
    this.valor = null;
    this.vence = 0;
    this.enCurso = null;
  }

  async obtener(calcular) {
    if (this.valor && Date.now() < this.vence) return this.valor;
    // Si llegan muchas visitas a la vez, todas esperan el mismo cálculo.
    this.enCurso ??= calcular()
      .then((v) => {
        this.valor = v;
        this.vence = Date.now() + this.ms;
        return v;
      })
      .finally(() => {
        this.enCurso = null;
      });
    return this.enCurso;
  }

  invalidar() {
    this.valor = null;
    this.vence = 0;
  }
}
