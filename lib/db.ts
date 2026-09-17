/**
 * Acceso directo a la base de la suite: prepararla, vaciarla y mirarla.
 *
 * Los tests NO usan esto para armar escenarios (para eso esta `lib/api`, que
 * pasa por la logica de negocio real). Aca vive solo el aislamiento respecto de
 * la base de desarrollo, el reset entre corridas y alguna verificacion de
 * estado que la UI no muestre.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

import {
  E2E_DATABASE_NAME,
  E2E_SCHEMA_NAME,
  dbConfig,
  parseJdbcUrl,
  withDatabase,
  withSchema,
  type DbConfig,
} from './config';
import { schemaSql } from './paths';

/**
 * Tablas del schema real, en el orden en que las declara `schema.sql`.
 *
 * Se parsea el archivo en vez de copiar la lista: el dia que agreguen una
 * tabla, el reset la incluye solo y nadie tiene que acordarse de venir aca.
 */
export function tablesFromSchema(): string[] {
  // Los comentarios se sacan antes de buscar: el encabezado del schema explica
  // la regla escribiendo "CREATE TABLE IF NOT EXISTS" en prosa, y sin esto la
  // palabra siguiente entraba a la lista como si fuera una tabla.
  const sql = readFileSync(schemaSql, 'utf8').replace(/--.*$/gm, '');
  const matches = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi);
  const tables = [...matches].map((match) => match[1]!.toLowerCase());
  if (tables.length === 0) {
    throw new Error(`No encontre ninguna tabla en ${schemaSql}. ¿Cambio el formato del schema?`);
  }
  return [...new Set(tables)];
}

/** Abre una conexion, corre `fn` y cierra siempre, aunque `fn` falle. */
export async function withClient<T>(
  config: DbConfig | pg.ClientConfig,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client(config as pg.ClientConfig);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export type Isolation =
  | { kind: 'database'; jdbcUrl: string; created: boolean }
  | { kind: 'schema'; jdbcUrl: string; created: boolean };

/**
 * Consigue un lugar aislado donde la suite pueda crear y borrar tablas sin
 * tocar los datos de desarrollo. Prueba dos estrategias en orden, porque los
 * permisos de Postgres varian de maquina en maquina:
 *
 *   1. Base propia `paw2_e2e`. Lo mas limpio, pero necesita CREATEDB.
 *   2. Schema propio `e2e` dentro de la base de dev. Alcanza con ser dueño de
 *      la base, que es lo que todos tienen si la crearon ellos.
 *
 * Cual salio se guarda en el `.env.e2e` de cada uno, asi que el resto de la
 * suite no se entera: solo lee `database.url`.
 */
export async function ensureIsolatedStorage(devJdbcUrl: string, user: string, password: string): Promise<Isolation> {
  const dev = parseJdbcUrl(devJdbcUrl);
  const admin = { host: dev.host, port: dev.port, user, password };

  const databaseUrl = withDatabase(devJdbcUrl, E2E_DATABASE_NAME);
  try {
    const created = await withClient({ ...admin, database: 'postgres' }, async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        E2E_DATABASE_NAME,
      ]);
      if (rowCount && rowCount > 0) return false;
      // CREATE DATABASE no acepta parametros bindeados; el nombre es una
      // constante nuestra, nunca algo que venga de afuera.
      await client.query(`CREATE DATABASE ${E2E_DATABASE_NAME}`);
      return true;
    });
    return { kind: 'database', jdbcUrl: databaseUrl, created };
  } catch (error) {
    if (!isPermissionError(error)) throw error;
  }

  const schemaUrl = withSchema(devJdbcUrl, E2E_SCHEMA_NAME);
  const created = await withClient({ ...admin, database: dev.database }, async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [
      E2E_SCHEMA_NAME,
    ]);
    if (rowCount && rowCount > 0) return false;
    await client.query(`CREATE SCHEMA ${E2E_SCHEMA_NAME}`);
    return true;
  });
  return { kind: 'schema', jdbcUrl: schemaUrl, created };
}

const isPermissionError = (error: unknown): boolean =>
  // 42501 = insufficient_privilege. Es el unico fallo que amerita el plan B:
  // si Postgres no esta levantado, el error tiene que llegar arriba tal cual.
  (error as { code?: string }).code === '42501' ||
  /permission denied/i.test((error as Error).message ?? '');

/** ¿Ya corrio la app contra este lugar y creo las tablas? */
export async function hasSchema(config: DbConfig = dbConfig()): Promise<boolean> {
  return withClient(config, async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = ANY($2)`,
      [config.schema, tablesFromSchema()],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  });
}

/**
 * Vacia todas las tablas y reinicia los ids, para que los tests puedan afirmar
 * sobre ids predecibles. CASCADE evita tener que ordenar por foreign keys.
 *
 * Si la app nunca corrio contra este lugar todavia no hay tablas: no es un
 * error, es la primera corrida.
 */
export async function resetDatabase(config: DbConfig = dbConfig()): Promise<string[]> {
  if (!(await hasSchema(config))) return [];
  const tables = tablesFromSchema().map((table) => `${config.schema}.${table}`);
  await withClient(config, (client) =>
    client.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
  );
  return tables;
}

/** Una consulta suelta contra la base de la suite, para verificar estado. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  config: DbConfig = dbConfig(),
): Promise<T[]> {
  return withClient(config, async (client) => (await client.query<T>(sql, params)).rows);
}

/**
 * Asciende un usuario a ADMIN.
 *
 * Unico caso en que la suite escribe en la base en vez de pasar por la app: no
 * hay pantalla ni endpoint para dar ese rol. La receta manual esta documentada
 * en persistence/src/main/resources/migrations/README.md y es exactamente este
 * UPDATE, asi que el test hace lo mismo que haria una persona.
 */
export async function promoteToAdmin(email: string, config: DbConfig = dbConfig()): Promise<void> {
  const updated = await withClient(config, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE users SET role = 'ADMIN' WHERE email = $1 AND status = 'ACTIVE'`,
      [email],
    );
    return rowCount ?? 0;
  });
  if (updated === 0) {
    throw new Error(`No pude ascender a "${email}": no existe o no esta ACTIVE.`);
  }
}

/**
 * Tira el schema de la suite entero para que la app lo vuelva a crear.
 *
 * Hace falta cada vez que entra una migracion. `schema.sql` es todo
 * `CREATE TABLE IF NOT EXISTS` — tiene que poder correrse de nuevo sin romper
 * nada — asi que sobre un schema que ya existe **no agrega columnas nuevas**:
 * las que entran entre sprints viven en `migrations/` y se aplican a mano
 * contra la base de la catedra. El lugar de la suite es descartable, asi que en
 * vez de replicar las migraciones se rehace de cero y queda igual al
 * `schema.sql` de hoy.
 *
 * El guardarrail importante: solo borra un schema que no sea `public`. La base
 * de desarrollo no se toca ni por accidente.
 */
export async function dropSchema(config: DbConfig = dbConfig()): Promise<void> {
  if (config.schema === 'public') {
    throw new Error(
      'Me estas pidiendo borrar el schema "public", que es donde vive tu base de desarrollo.\n' +
        'La suite trabaja en un schema aparte: corre `npm run setup` antes.',
    );
  }
  await withClient({ ...config, options: undefined }, async (client) => {
    await client.query(`DROP SCHEMA IF EXISTS ${config.schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${config.schema}`);
  });
}
