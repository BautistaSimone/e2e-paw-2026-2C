/**
 * Rehace el schema de la suite de cero. Correlo cuando entra una migracion y
 * la app empieza a fallar con "column ... does not exist": ver `dropSchema`.
 */
import { dbConfig } from '../lib/config';
import { dropSchema } from '../lib/db';

const config = dbConfig();
await dropSchema(config);
console.log(
  `Schema "${config.schema}" rehecho en ${config.database}.\n` +
    `Las tablas las vuelve a crear la app la proxima vez que arranque.`,
);
