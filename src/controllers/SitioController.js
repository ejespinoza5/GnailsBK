/** Capa HTTP de la página pública: datos de la landing (públicos) y su edición (admin). */
export class SitioController {
  constructor({ sitioService }) {
    this.sitio = sitioService;
  }

  // ---------- Público

  // GET /api/publico/landing
  landing = async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await this.sitio.landing());
  };

  // GET /api/publico/fotos/:id?t=mini
  foto = async (req, res) => {
    const datos = await this.sitio.archivoFoto(req.valido.params.id, req.query.t === 'mini');
    // La URL lleva ?v=<versión>: si la foto cambia, cambia la URL. Se guarda en caché un año.
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(datos);
  };

  // ---------- Administradora

  // GET /api/admin/sitio
  contenido = async (req, res) => {
    res.json(await this.sitio.contenido());
  };

  // GET /api/admin/sitio/fotos/:id (incluye las ocultas)
  fotoAdmin = async (req, res) => {
    const datos = await this.sitio.archivoFotoAdmin(req.valido.params.id, req.query.t === 'mini');
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(datos);
  };

  // PUT /api/admin/sitio/textos
  guardarTextos = async (req, res) => {
    res.json({ sitio: await this.sitio.guardarTextos(req.body) });
  };

  // PUT /api/admin/sitio/ubicacion
  guardarUbicacion = async (req, res) => {
    res.json({ sitio: await this.sitio.guardarUbicacion(req.body) });
  };

  // POST /api/admin/sitio/resolver-mapa
  resolverMapa = async (req, res) => {
    res.json(await this.sitio.resolverMapa(req.body.url));
  };

  // POST /api/admin/sitio/portada (multipart "foto")
  subirPortada = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Elige una foto', campos: { foto: 'Elige una foto' } });
    await this.sitio.subirPortada(req.file.buffer);
    res.json(await this.sitio.contenido());
  };

  // DELETE /api/admin/sitio/portada
  quitarPortada = async (req, res) => {
    await this.sitio.quitarPortada();
    res.json(await this.sitio.contenido());
  };

  // POST /api/admin/sitio/galeria (multipart "foto" + "titulo" opcional)
  subirFoto = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Elige una foto', campos: { foto: 'Elige una foto' } });
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim().slice(0, 100) || null : null;
    await this.sitio.subirFotoGaleria(req.file.buffer, titulo);
    res.status(201).json(await this.sitio.contenido());
  };

  // PATCH /api/admin/sitio/galeria/:id
  actualizarFoto = async (req, res) => {
    await this.sitio.actualizarFoto(req.valido.params.id, req.body);
    res.json(await this.sitio.contenido());
  };

  // PUT /api/admin/sitio/galeria/orden
  ordenar = async (req, res) => {
    await this.sitio.ordenarGaleria(req.body.ids);
    res.json(await this.sitio.contenido());
  };

  // DELETE /api/admin/sitio/galeria/:id
  eliminarFoto = async (req, res) => {
    await this.sitio.eliminarFoto(req.valido.params.id);
    res.json(await this.sitio.contenido());
  };
}
