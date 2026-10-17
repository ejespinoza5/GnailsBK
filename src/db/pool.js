import pg from 'pg';
import { env } from '../config/env.js';

// DATE llega como texto 'YYYY-MM-DD' (sin convertir a Date): una fecha de cita
// no tiene zona horaria y convertirla podría correrla un día.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.dbSsl ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

// El pool se inyecta en los repositorios (ver container.js).
// REGLA: siempre db.query(sql, [valores]) con parámetros $1, $2... y nunca
// concatenar valores en el SQL. pg envía la consulta y los valores por separado,
// así que la inyección SQL no es posible aunque el valor contenga comillas o código.
