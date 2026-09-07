/** Diagnostico rapido: donde quedaron las tablas y cuantas filas hay. */
import { dbConfig } from '../lib/config';
import { query } from '../lib/db';

const config = dbConfig();
const rows = await query<{ table_schema: string; tablas: number }>(
  `SELECT table_schema, COUNT(*)::int AS tablas
     FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    GROUP BY table_schema ORDER BY table_schema`,
  [],
  config,
);
console.log(`Base ${config.database}, la suite trabaja en el schema "${config.schema}":`);
for (const row of rows) {
  const marca = row.table_schema === config.schema ? ' <- suite' : '';
  console.log(`  ${row.table_schema}: ${row.tablas} tablas${marca}`);
}
