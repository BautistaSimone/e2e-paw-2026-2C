/** Vacia las tablas de la suite. Util a mano; los tests lo hacen solos. */
import { dbConfig } from '../lib/config';
import { resetDatabase } from '../lib/db';

const config = dbConfig();
const tables = await resetDatabase(config);
console.log(
  tables.length
    ? `Vacie ${tables.length} tablas en ${config.database} (schema ${config.schema}).`
    : `No hay tablas todavia en ${config.database} (schema ${config.schema}): levanta la app una vez.`,
);
