/**
 * Unico modulo con puertos, URLs y credenciales.
 *
 * Regla: ni un test, ni un page object, ni un escenario escribe un puerto o un
 * `http://localhost:...` a mano. Todo sale de aca, y todo se puede pisar con
 * una variable de entorno para el que tenga un puerto ocupado:
 *
 *     APP_PORT=8090 npm test
 */
import { existsSync, readFileSync } from 'node:fs';
import dotenv from 'dotenv';

import { devEnvFile, e2eEnvFile } from './paths';

/** Base propia de la suite, cuando el usuario de Postgres puede crearla. */
export const E2E_DATABASE_NAME = 'paw2_e2e';

/** Schema propio dentro de la base de dev, cuando no puede (ver lib/db.ts). */
export const E2E_SCHEMA_NAME = 'e2e';

const num = (value: string | undefined, fallback: number): number =>
  value === undefined || value.trim() === '' ? fallback : Number(value);

export const ports = {
  /** Jetty levantado por la suite. Distinto de 8080 para no chocar con el de dev. */
  app: num(process.env.APP_PORT, 8081),
  /** SMTP falso de Mailpit: aca escribe la app en vez de Gmail. */
  smtp: num(process.env.SMTP_PORT, 1025),
  /** API + UI web de Mailpit: de aca leen los tests los mails. */
  mailpit: num(process.env.MAILPIT_UI_PORT, 8025),
} as const;

export const baseUrl = process.env.BASE_URL ?? `http://localhost:${ports.app}`;
export const mailpitUrl = `http://localhost:${ports.mailpit}`;

/**
 * Lee un archivo estilo `.env` de la app (formato properties de Java: claves
 * con puntos, `database.url=...`). Devuelve {} si no existe: antes de correr el
 * setup todavia no hay `.env.e2e`, y cargar la config no puede explotar por eso.
 */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return dotenv.parse(readFileSync(file));
}

/** Config del `.env` de desarrollo de esta maquina (la que ya le funciona). */
export const devEnv = (): Record<string, string> => readEnvFile(devEnvFile);

/** Config del `.env.e2e` que genera el setup. */
export const e2eEnv = (): Record<string, string> => readEnvFile(e2eEnvFile);

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** Schema donde viven las tablas de la suite. */
  schema: string;
  /** Le dice al driver `pg` que trabaje en ese schema, como hace la app. */
  options?: string;
}

/**
 * Traduce la URL JDBC de la app a lo que espera el driver `pg` de Node.
 * `jdbc:postgresql://host:5432/base?currentSchema=e2e`
 */
export function parseJdbcUrl(jdbcUrl: string): { host: string; port: number; database: string; schema: string } {
  const match = /^jdbc:postgresql:\/\/([^:/]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/.exec(jdbcUrl.trim());
  if (!match) {
    throw new Error(
      `No puedo interpretar la URL de la base: "${jdbcUrl}".\n` +
        `Se espera el formato jdbc:postgresql://host:puerto/base`,
    );
  }
  const [, host, port, database, query] = match as unknown as [
    string, string, string | undefined, string, string | undefined,
  ];
  const schema = query ? (new URLSearchParams(query).get('currentSchema') ?? 'public') : 'public';
  return { host, port: port ? Number(port) : 5432, database, schema };
}

/** Reemplaza el nombre de base de una URL JDBC conservando host, puerto y query. */
export function withDatabase(jdbcUrl: string, database: string): string {
  return jdbcUrl.replace(/\/([^/?]+)(\?|$)/, `/${database}$2`);
}

/** Agrega (o pisa) el `currentSchema` de una URL JDBC. */
export function withSchema(jdbcUrl: string, schema: string): string {
  const [base] = jdbcUrl.split('?');
  return `${base}?currentSchema=${schema}`;
}

/**
 * Credenciales de Postgres para la suite. Salen del archivo indicado (por
 * defecto el `.env.e2e`), no de constantes: cada maquina tiene su usuario.
 */
export function dbConfig(env: Record<string, string> = e2eEnv()): DbConfig {
  const url = env['database.url'];
  if (!url) {
    throw new Error(
      'Falta database.url. Corre `npm run setup` para generar el .env.e2e a partir de tu .env.',
    );
  }
  const parsed = parseJdbcUrl(url);
  return {
    ...parsed,
    user: env['database.username'] ?? '',
    password: env['database.password'] ?? '',
    // Mismo search_path que usa la app, para que el reset toque las tablas de
    // la suite y jamas las de desarrollo.
    options: `-c search_path=${parsed.schema}`,
  };
}

/** Mail del organizador: a esa casilla llegan las notificaciones de inscripcion. */
export const organizerEmail = (env: Record<string, string> = e2eEnv()): string =>
  env['app.organizer-email'] ?? env['mail.username'] ?? 'organizador@fuchibol.test';
