/**
 * Responsabilidad única: leer y escribir las cookies de sesión.
 *
 *  ACCESS  → JWT, viaja a toda la API (Path=/).
 *  REFRESH → solo viaja a /api/auth (Path restringido).
 *
 * Ambas HttpOnly (JavaScript no puede leerlas: protege contra XSS) y
 * SameSite=Strict (no se envían desde otros sitios: protege contra CSRF).
 * En producción: Secure + prefijos __Host- / __Secure- (obligan HTTPS y
 * evitan que un subdominio las sobrescriba).
 */
export class CookieManager {
  constructor({ esProduccion, accessMs, refreshMs, rutaRefresh = '/api/auth' }) {
    this.nombreAccess = esProduccion ? '__Host-gn_access' : 'gn_access';
    this.nombreRefresh = esProduccion ? '__Secure-gn_refresh' : 'gn_refresh';
    this.base = { httpOnly: true, secure: esProduccion, sameSite: 'strict' };
    this.accessMs = accessMs;
    this.refreshMs = refreshMs;
    this.rutaRefresh = rutaRefresh;
  }

  /** Si refreshToken es null, solo se actualiza el access token. */
  escribir(res, { accessToken, refreshToken }) {
    res.cookie(this.nombreAccess, accessToken, { ...this.base, path: '/', maxAge: this.accessMs });
    if (refreshToken) {
      res.cookie(this.nombreRefresh, refreshToken, { ...this.base, path: this.rutaRefresh, maxAge: this.refreshMs });
    }
  }

  borrar(res) {
    res.clearCookie(this.nombreAccess, { ...this.base, path: '/' });
    res.clearCookie(this.nombreRefresh, { ...this.base, path: this.rutaRefresh });
  }

  leerAccess(req) {
    return this.#leer(req, this.nombreAccess, 2048);
  }

  leerRefresh(req) {
    return this.#leer(req, this.nombreRefresh, 100);
  }

  #leer(req, nombre, largoMax) {
    const valor = req.cookies?.[nombre];
    return typeof valor === 'string' && valor.length >= 20 && valor.length <= largoMax ? valor : null;
  }
}
