-- =====================================================================
--  GEOVYS NAILS - Script de base de datos (PostgreSQL 13+)
--  Ejecutar manualmente en este orden. Cada bloque nuevo que se agregue
--  al proyecto irá al final del archivo con su fecha.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) (Opcional) Crear base de datos y usuario de la aplicación
--    Ejecutar conectado como superusuario (postgres). Cambia la contraseña.
-- ---------------------------------------------------------------------
-- CREATE DATABASE geovys_nails WITH ENCODING 'UTF8';
-- CREATE USER geovys_app WITH PASSWORD 'cambia_esta_contraseña';
-- GRANT CONNECT ON DATABASE geovys_nails TO geovys_app;
-- Luego conéctate a geovys_nails (\c geovys_nails) y continúa.


-- =====================================================================
-- 2026-10-15  ·  MÓDULO DE AUTENTICACIÓN
-- =====================================================================

-- gen_random_uuid() viene incluido desde PostgreSQL 13.
-- Si usas una versión anterior, descomenta:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Función genérica para mantener actualizado el campo actualizado_en
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Usuarios
--   - password_hash es NULL si la persona solo usa Google.
--   - google_id es NULL si la persona solo usa correo/contraseña.
--   - Cada cuenta usa UN método: si el correo ya se registró con
--     contraseña, Google lo rechaza (y viceversa).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre             VARCHAR(100) NOT NULL,
    email              VARCHAR(254) NOT NULL,
    password_hash      TEXT,
    google_id          VARCHAR(255),
    avatar_url         TEXT,
    email_verificado   BOOLEAN      NOT NULL DEFAULT FALSE,
    rol                VARCHAR(20)  NOT NULL DEFAULT 'cliente',
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    intentos_fallidos  INTEGER      NOT NULL DEFAULT 0,
    bloqueado_hasta    TIMESTAMPTZ,
    ultimo_acceso      TIMESTAMPTZ,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usuarios_email      UNIQUE (email),
    CONSTRAINT uq_usuarios_google_id  UNIQUE (google_id),
    CONSTRAINT ck_usuarios_email_min  CHECK (email = LOWER(email)),
    CONSTRAINT ck_usuarios_rol        CHECK (rol IN ('cliente', 'admin')),
    CONSTRAINT ck_usuarios_metodo     CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL),
    CONSTRAINT ck_usuarios_intentos   CHECK (intentos_fallidos >= 0)
);

DROP TRIGGER IF EXISTS trg_usuarios_actualizado_en ON usuarios;
CREATE TRIGGER trg_usuarios_actualizado_en
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- Sesiones
--   La cookie del navegador lleva un token aleatorio de 256 bits.
--   Aquí solo se guarda su hash SHA-256: si alguien roba la BDD no puede
--   usar los tokens para suplantar sesiones.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id   UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash   CHAR(64)     NOT NULL,
    ip           VARCHAR(45),
    user_agent   VARCHAR(500),
    creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expira_en    TIMESTAMPTZ  NOT NULL,

    CONSTRAINT uq_sesiones_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS ix_sesiones_usuario  ON sesiones (usuario_id);
CREATE INDEX IF NOT EXISTS ix_sesiones_expira   ON sesiones (expira_en);

-- ---------------------------------------------------------------------
-- Permisos para el usuario de la aplicación (si lo creaste en el paso 0)
--   La app solo necesita leer/escribir datos, nunca modificar tablas.
-- ---------------------------------------------------------------------
-- GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios, sesiones TO geovys_app;

-- ---------------------------------------------------------------------
-- Para convertir tu cuenta en administradora (después de registrarte):
-- ---------------------------------------------------------------------
-- UPDATE usuarios SET rol = 'admin' WHERE email = 'tu_correo@gmail.com';


-- =====================================================================
-- 2026-10-15  ·  JWT + REFRESH TOKEN CON ROTACIÓN
--   Cada fila de "sesiones" es ahora un dispositivo con sesión iniciada.
--   token_hash guarda el hash del refresh token vigente. Cada vez que se
--   renueva, el anterior pasa a token_hash_anterior: si alguien vuelve a
--   usar uno viejo (posible robo), la sesión completa se elimina.
--   Seguro ejecutarlo aunque ya hayas corrido el bloque anterior.
-- =====================================================================
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS token_hash_anterior CHAR(64);
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS rotado_en           TIMESTAMPTZ;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS ultimo_uso          TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_sesiones_token_anterior ON sesiones (token_hash_anterior);


-- =====================================================================
-- 2026-10-15  ·  MÓDULO DE CITAS (servicios, profesionales, horarios)
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
--   btree_gist viene incluido en PostgreSQL y el dueño de la base de
--   datos puede activarlo.
-- =====================================================================

-- Permite que la BDD impida dos citas de la misma profesional a la vez
-- (restricción EXCLUDE de la tabla citas), incluso si dos clientas
-- reservan en el mismo segundo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- Servicios que ofrece el local
--   disponible_desde / disponible_hasta son opcionales: sirven para
--   servicios de temporada (p. ej. diseños navideños). NULL = siempre.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            VARCHAR(100)  NOT NULL,
    descripcion       VARCHAR(500),
    duracion_min      SMALLINT      NOT NULL,
    precio            NUMERIC(10,2),
    disponible_desde  DATE,
    disponible_hasta  DATE,
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_servicios_duracion CHECK (duracion_min BETWEEN 5 AND 480),
    CONSTRAINT ck_servicios_precio   CHECK (precio IS NULL OR precio >= 0),
    CONSTRAINT ck_servicios_fechas   CHECK (disponible_desde IS NULL OR disponible_hasta IS NULL
                                            OR disponible_hasta >= disponible_desde)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_servicios_nombre ON servicios (LOWER(nombre));

DROP TRIGGER IF EXISTS trg_servicios_actualizado_en ON servicios;
CREATE TRIGGER trg_servicios_actualizado_en
    BEFORE UPDATE ON servicios
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- Profesionales (manicuristas)
--   dias_laborales: 0 = domingo, 1 = lunes ... 6 = sábado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesionales (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(100)  NOT NULL,
    descripcion     VARCHAR(300),
    dias_laborales  SMALLINT[]    NOT NULL DEFAULT '{1,2,3,4,5,6}',
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_profesionales_dias CHECK (dias_laborales <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[])
);

DROP TRIGGER IF EXISTS trg_profesionales_actualizado_en ON profesionales;
CREATE TRIGGER trg_profesionales_actualizado_en
    BEFORE UPDATE ON profesionales
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Qué servicios sabe hacer cada profesional
CREATE TABLE IF NOT EXISTS profesional_servicios (
    profesional_id  UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
    servicio_id     UUID NOT NULL REFERENCES servicios(id)     ON DELETE CASCADE,
    PRIMARY KEY (profesional_id, servicio_id)
);

CREATE INDEX IF NOT EXISTS ix_profesional_servicios_servicio ON profesional_servicios (servicio_id);

-- ---------------------------------------------------------------------
-- Horario de atención del local por día de la semana (0 = domingo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horario_semanal (
    dia_semana     SMALLINT  PRIMARY KEY,
    abierto        BOOLEAN   NOT NULL DEFAULT TRUE,
    hora_apertura  TIME      NOT NULL,
    hora_cierre    TIME      NOT NULL,

    CONSTRAINT ck_horario_dia   CHECK (dia_semana BETWEEN 0 AND 6),
    CONSTRAINT ck_horario_horas CHECK (hora_cierre > hora_apertura)
);

-- Horario inicial: lunes a sábado de 09:00 a 19:00, domingo cerrado.
-- La administradora lo cambia desde la app. No pisa cambios ya hechos.
INSERT INTO horario_semanal (dia_semana, abierto, hora_apertura, hora_cierre) VALUES
    (0, FALSE, '09:00', '14:00'),
    (1, TRUE,  '09:00', '19:00'),
    (2, TRUE,  '09:00', '19:00'),
    (3, TRUE,  '09:00', '19:00'),
    (4, TRUE,  '09:00', '19:00'),
    (5, TRUE,  '09:00', '19:00'),
    (6, TRUE,  '09:00', '19:00')
ON CONFLICT (dia_semana) DO NOTHING;

-- ---------------------------------------------------------------------
-- Días sin atención
--   profesional_id NULL      = cierra todo el local (feriado, vacaciones).
--   profesional_id con valor = solo esa profesional no atiende ese día.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dias_bloqueados (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha           DATE          NOT NULL,
    profesional_id  UUID          REFERENCES profesionales(id) ON DELETE CASCADE,
    motivo          VARCHAR(150),
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_bloqueados_local
    ON dias_bloqueados (fecha) WHERE profesional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_bloqueados_profesional
    ON dias_bloqueados (fecha, profesional_id) WHERE profesional_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Reglas de reserva (una sola fila; la edita la administradora)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
    id                 SMALLINT     PRIMARY KEY DEFAULT 1,
    intervalo_min      SMALLINT     NOT NULL DEFAULT 30,  -- cada cuántos minutos empieza un turno
    anticipacion_min   SMALLINT     NOT NULL DEFAULT 60,  -- minutos mínimos de anticipación
    dias_maximos       SMALLINT     NOT NULL DEFAULT 60,  -- hasta cuántos días adelante se reserva
    horas_cancelacion  SMALLINT     NOT NULL DEFAULT 12,  -- la clienta cancela hasta X horas antes
    max_citas_activas  SMALLINT     NOT NULL DEFAULT 3,   -- citas futuras por clienta
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_configuracion_unica       CHECK (id = 1),
    CONSTRAINT ck_configuracion_intervalo   CHECK (intervalo_min IN (10, 15, 20, 30, 45, 60)),
    CONSTRAINT ck_configuracion_anticipa    CHECK (anticipacion_min BETWEEN 0 AND 10080),
    CONSTRAINT ck_configuracion_dias        CHECK (dias_maximos BETWEEN 1 AND 365),
    CONSTRAINT ck_configuracion_cancelacion CHECK (horas_cancelacion BETWEEN 0 AND 168),
    CONSTRAINT ck_configuracion_max_citas   CHECK (max_citas_activas BETWEEN 1 AND 20)
);

INSERT INTO configuracion (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_configuracion_actualizado_en ON configuracion;
CREATE TRIGGER trg_configuracion_actualizado_en
    BEFORE UPDATE ON configuracion
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- Citas
--   fecha y horas están en la hora local del salón (ZONA_HORARIA del .env).
--   precio guarda el precio del momento de la reserva: si luego cambia el
--   precio del servicio, el historial no se altera.
--   ex_citas_solapadas: la BDD rechaza dos citas activas de la misma
--   profesional que se crucen en el tiempo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citas (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id      UUID          NOT NULL REFERENCES usuarios(id),
    profesional_id  UUID          NOT NULL REFERENCES profesionales(id),
    servicio_id     UUID          NOT NULL REFERENCES servicios(id),
    fecha           DATE          NOT NULL,
    hora_inicio     TIME          NOT NULL,
    hora_fin        TIME          NOT NULL,
    precio          NUMERIC(10,2),
    notas           VARCHAR(300),
    estado          VARCHAR(20)   NOT NULL DEFAULT 'confirmada',
    cancelada_por   VARCHAR(10),
    cancelada_en    TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_citas_horas   CHECK (hora_fin > hora_inicio),
    CONSTRAINT ck_citas_estado  CHECK (estado IN ('confirmada', 'completada', 'cancelada', 'no_asistio')),
    CONSTRAINT ck_citas_cancela CHECK (cancelada_por IS NULL OR cancelada_por IN ('cliente', 'admin')),
    CONSTRAINT ex_citas_solapadas EXCLUDE USING gist (
        profesional_id WITH =,
        tsrange(fecha + hora_inicio, fecha + hora_fin) WITH &&
    ) WHERE (estado <> 'cancelada')
);

CREATE INDEX IF NOT EXISTS ix_citas_fecha    ON citas (fecha);
CREATE INDEX IF NOT EXISTS ix_citas_cliente  ON citas (cliente_id, fecha);
CREATE INDEX IF NOT EXISTS ix_citas_servicio ON citas (servicio_id);

DROP TRIGGER IF EXISTS trg_citas_actualizado_en ON citas;
CREATE TRIGGER trg_citas_actualizado_en
    BEFORE UPDATE ON citas
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Si creaste el usuario geovys_app en el paso 0:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON servicios, profesionales, profesional_servicios,
--       horario_semanal, dias_bloqueados, configuracion, citas TO geovys_app;

-- ---------------------------------------------------------------------
-- La administradora entra por el mismo login. Después de que se registre
-- en la app (con correo o con Google), cambia el correo y ejecuta:
-- ---------------------------------------------------------------------
-- UPDATE usuarios SET rol = 'admin' WHERE email = 'correo_de_la_duena@gmail.com';


-- =====================================================================
-- 2026-10-16  ·  CUENTA DE USUARIO Y RECUPERACIÓN DE CONTRASEÑA
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- Teléfono opcional (WhatsApp) para que el salón pueda avisar cambios.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);

-- ---------------------------------------------------------------------
-- Foto de perfil subida por la persona
--   Se guarda ya comprimida (WebP de 320x320, unos 10-30 KB) dentro de la
--   BDD: entra en los respaldos y no depende del disco del servidor.
--   usuarios.avatar_url apunta a /api/avatares/<id>; las fotos de Google
--   siguen siendo un enlace externo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avatares (
    usuario_id      UUID          PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    imagen          BYTEA         NOT NULL,
    tipo            VARCHAR(30)   NOT NULL DEFAULT 'image/webp',
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_avatares_tamano CHECK (octet_length(imagen) <= 204800)
);

-- ---------------------------------------------------------------------
-- Enlaces de recuperación de contraseña
--   El correo lleva un token aleatorio de 256 bits; aquí solo se guarda su
--   hash SHA-256. Duran 30 minutos y sirven una sola vez.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recuperaciones_password (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash  CHAR(64)      NOT NULL,
    expira_en   TIMESTAMPTZ   NOT NULL,
    usado_en    TIMESTAMPTZ,
    ip          VARCHAR(45),
    creado_en   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_recuperaciones_token UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS ix_recuperaciones_usuario ON recuperaciones_password (usuario_id);
CREATE INDEX IF NOT EXISTS ix_recuperaciones_expira  ON recuperaciones_password (expira_en);

-- Si creaste el usuario geovys_app en el paso 0:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON avatares, recuperaciones_password TO geovys_app;


-- =====================================================================
-- 2026-10-16  ·  VERIFICACIÓN DEL CORREO CON CÓDIGO
--   Al registrarse con correo y contraseña llega un código de 6 dígitos
--   que vence en 15 minutos. Hasta verificar, la cuenta no puede reservar.
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Un código vigente por persona (pedir otro reemplaza al anterior).
--   codigo_hash = HMAC-SHA256 del código con un secreto del servidor:
--   aunque alguien lea la BDD, no puede probar los 1.000.000 de códigos.
--   intentos: tras 5 códigos equivocados el código deja de servir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verificaciones_email (
    usuario_id   UUID          PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_hash  CHAR(64)      NOT NULL,
    expira_en    TIMESTAMPTZ   NOT NULL,
    intentos     SMALLINT      NOT NULL DEFAULT 0,
    creado_en    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_verificaciones_intentos CHECK (intentos >= 0)
);

-- Las cuentas que ya existen con contraseña tendrán que verificar su correo
-- la próxima vez que entren. Si prefieres darlas por verificadas, descomenta:
-- UPDATE usuarios SET email_verificado = TRUE WHERE password_hash IS NOT NULL;

-- Si creaste el usuario geovys_app en el paso 0:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON verificaciones_email TO geovys_app;


-- =====================================================================
-- 2026-10-16  ·  LANDING PÚBLICA: PORTADA, GALERÍA, UBICACIÓN Y RESEÑAS
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Datos de la página (una sola fila; la edita la administradora)
--   La ubicación inicial es la del enlace de Google Maps del local.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sitio (
    id              SMALLINT       PRIMARY KEY DEFAULT 1,
    hero_titulo     VARCHAR(120)   NOT NULL DEFAULT 'Uñas que hablan por ti',
    hero_subtitulo  VARCHAR(240)   NOT NULL DEFAULT 'Manicure, pedicure y diseños hechos a mano. Reserva tu turno en un minuto.',
    direccion       VARCHAR(200),
    referencia      VARCHAR(200),
    latitud         NUMERIC(9,6),
    longitud        NUMERIC(9,6),
    maps_url        VARCHAR(500),
    whatsapp        VARCHAR(20),
    instagram       VARCHAR(60),
    facebook        VARCHAR(120),
    actualizado_en  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_sitio_unico   CHECK (id = 1),
    CONSTRAINT ck_sitio_coords  CHECK ((latitud IS NULL) = (longitud IS NULL)),
    CONSTRAINT ck_sitio_latitud CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
    CONSTRAINT ck_sitio_longitud CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180)
);

INSERT INTO sitio (id, latitud, longitud, maps_url)
VALUES (1, -0.225120, -79.161901, 'https://maps.app.goo.gl/H2sf8dgsk6vrFJHz6')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_sitio_actualizado_en ON sitio;
CREATE TRIGGER trg_sitio_actualizado_en
    BEFORE UPDATE ON sitio
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- Fotos de la página: la portada (una sola) y la galería de trabajos.
--   Se guardan ya optimizadas en WebP: imagen grande y miniatura.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fotos_sitio (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            VARCHAR(10)    NOT NULL,
    imagen          BYTEA          NOT NULL,
    miniatura       BYTEA          NOT NULL,
    ancho           INTEGER        NOT NULL,
    alto            INTEGER        NOT NULL,
    titulo          VARCHAR(100),
    orden           INTEGER        NOT NULL DEFAULT 0,
    visible         BOOLEAN        NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_fotos_tipo    CHECK (tipo IN ('portada', 'galeria')),
    CONSTRAINT ck_fotos_tamano  CHECK (octet_length(imagen) <= 2097152 AND octet_length(miniatura) <= 524288)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fotos_portada ON fotos_sitio (tipo) WHERE tipo = 'portada';
CREATE INDEX IF NOT EXISTS ix_fotos_galeria ON fotos_sitio (tipo, orden);

DROP TRIGGER IF EXISTS trg_fotos_actualizado_en ON fotos_sitio;
CREATE TRIGGER trg_fotos_actualizado_en
    BEFORE UPDATE ON fotos_sitio
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- Reseñas: solo una por clienta y solo si ya tuvo una cita completada.
--   Se publican al instante; la administradora puede ocultarlas y responder.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resenas (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID           NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    calificacion    SMALLINT       NOT NULL,
    comentario      VARCHAR(600),
    visible         BOOLEAN        NOT NULL DEFAULT TRUE,
    respuesta       VARCHAR(600),
    respondida_en   TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_resenas_usuario     UNIQUE (usuario_id),
    CONSTRAINT ck_resenas_calificacion CHECK (calificacion BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS ix_resenas_visibles ON resenas (visible, creado_en DESC);

DROP TRIGGER IF EXISTS trg_resenas_actualizado_en ON resenas;
CREATE TRIGGER trg_resenas_actualizado_en
    BEFORE UPDATE ON resenas
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Si creaste el usuario geovys_app en el paso 0:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sitio, fotos_sitio, resenas TO geovys_app;


-- =====================================================================
-- 2026-10-16  ·  ACCESO DE LAS PROFESIONALES Y CITAS AGENDADAS POR EL SALÓN
--   - Rol "profesional": ve y gestiona solo su propia agenda.
--   - La dueña o la profesional pueden agendar citas, también para
--     clientas sin cuenta (solo nombre y teléfono).
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_rol;
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_rol CHECK (rol IN ('cliente', 'profesional', 'admin'));

-- La cuenta con la que entra cada profesional (una cuenta por profesional)
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profesionales_usuario ON profesionales (usuario_id) WHERE usuario_id IS NOT NULL;

-- Citas de clientas sin cuenta (agendadas por el salón)
ALTER TABLE citas ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS cliente_nombre   VARCHAR(100);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR(20);
-- Quién la agendó (NULL = la reservó la clienta desde la app)
ALTER TABLE citas ADD COLUMN IF NOT EXISTS creada_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE citas DROP CONSTRAINT IF EXISTS ck_citas_cliente;
ALTER TABLE citas ADD CONSTRAINT ck_citas_cliente CHECK (cliente_id IS NOT NULL OR cliente_nombre IS NOT NULL);


-- =====================================================================
-- 2026-10-16  ·  NOTIFICACIONES (bandeja en la app + push con Firebase)
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- Preferencias de cada persona. Los avisos de sus citas (confirmación,
-- cambios) siempre llegan; los recordatorios y las promociones se pueden apagar.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notif_recordatorios BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notif_promociones   BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------
-- Bandeja: cada aviso que recibe una persona (se ve en la campanita)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo        VARCHAR(30)   NOT NULL,
    titulo      VARCHAR(80)   NOT NULL,
    cuerpo      VARCHAR(240)  NOT NULL,
    url         VARCHAR(300),
    leida_en    TIMESTAMPTZ,
    creado_en   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_notificaciones_usuario ON notificaciones (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_notificaciones_no_leidas ON notificaciones (usuario_id) WHERE leida_en IS NULL;

-- ---------------------------------------------------------------------
-- Dispositivos con push activado (token de Firebase Cloud Messaging).
--   Un token es de un navegador/celular; si otra persona inicia sesión
--   en ese equipo, el token pasa a ella.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispositivos_push (
    token       VARCHAR(512)  PRIMARY KEY,
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    user_agent  VARCHAR(300),
    creado_en   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    ultimo_uso  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dispositivos_usuario ON dispositivos_push (usuario_id);

-- ---------------------------------------------------------------------
-- Recordatorios automáticos ya enviados (evita enviar dos veces el mismo).
--   umbral: minutos antes de la cita (1440 = día anterior, 30, 15, 5).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cita_recordatorios (
    cita_id    UUID         NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
    umbral     SMALLINT     NOT NULL,
    enviado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cita_id, umbral)
);

-- ---------------------------------------------------------------------
-- Promociones y avisos que la dueña envía o programa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campanas (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo           VARCHAR(80)   NOT NULL,
    cuerpo           VARCHAR(240)  NOT NULL,
    url              VARCHAR(300),
    programada_para  TIMESTAMPTZ   NOT NULL,
    estado           VARCHAR(12)   NOT NULL DEFAULT 'programada',
    destinatarios    INTEGER,
    enviada_en       TIMESTAMPTZ,
    creada_por       UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_campanas_estado CHECK (estado IN ('programada', 'enviando', 'enviada', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS ix_campanas_pendientes ON campanas (programada_para) WHERE estado = 'programada';

-- Si creaste el usuario geovys_app en el paso 0:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON notificaciones, dispositivos_push, cita_recordatorios, campanas TO geovys_app;


-- =====================================================================
-- 2026-10-16  ·  PRECIOS "DESDE" / RANGO Y MENSAJE AL RESERVAR
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- Tipo de precio de cada servicio:
--   fijo  → $18,50              desde → Desde $25,00
--   rango → $20,00 – $35,00     (precio NULL = "Precio en el salón")
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_tipo VARCHAR(10) NOT NULL DEFAULT 'fijo';
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_max  NUMERIC(10,2);

ALTER TABLE servicios DROP CONSTRAINT IF EXISTS ck_servicios_precio_tipo;
ALTER TABLE servicios ADD CONSTRAINT ck_servicios_precio_tipo CHECK (precio_tipo IN ('fijo', 'desde', 'rango'));
ALTER TABLE servicios DROP CONSTRAINT IF EXISTS ck_servicios_rango;
ALTER TABLE servicios ADD CONSTRAINT ck_servicios_rango
    CHECK (precio_tipo <> 'rango' OR (precio IS NOT NULL AND precio_max IS NOT NULL AND precio_max > precio));

-- La cita guarda cómo era el precio al reservar (si después cambia, el historial no se altera)
ALTER TABLE citas ADD COLUMN IF NOT EXISTS precio_tipo VARCHAR(10) NOT NULL DEFAULT 'fijo';
ALTER TABLE citas ADD COLUMN IF NOT EXISTS precio_max  NUMERIC(10,2);

-- Mensaje que ve la clienta al reservar (comprobante, "Mis turnos", confirmación y recordatorios).
-- La administradora lo edita en "Reglas de reserva". Vacío = no se muestra.
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS mensaje_reserva VARCHAR(200) NOT NULL
    DEFAULT 'Recuerda llegar 5 minutitos antes para empezar a tiempo. ¡Te esperamos!';


-- =====================================================================
-- 2026-10-22  ·  TIKTOK Y CITAS "VISTAS" POR EL SALÓN
--   Seguro ejecutarlo aunque ya hayas corrido los bloques anteriores.
-- =====================================================================

-- Usuario de TikTok del salón (sin @). Aparece en el pie de la página.
ALTER TABLE sitio ADD COLUMN IF NOT EXISTS tiktok VARCHAR(60);

-- Cuándo la dueña o la profesional marcó la cita como vista. La clienta no lo ve en la app:
-- solo le llega el aviso "Tu turno está asegurado". Las citas que agenda el salón nacen vistas.
-- Las citas que ya existían cuentan como vistas (no se avisa nada por ellas).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'citas' AND column_name = 'vista_en') THEN
        ALTER TABLE citas ADD COLUMN vista_en TIMESTAMPTZ;
        UPDATE citas SET vista_en = creado_en;
    END IF;
END $$;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS vista_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_citas_sin_ver ON citas (fecha) WHERE vista_en IS NULL AND estado = 'confirmada';
