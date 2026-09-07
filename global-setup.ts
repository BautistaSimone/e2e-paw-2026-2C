/**
 * Lo que corre una vez antes de toda la suite: SMTP falso arriba y base limpia.
 *
 * El reset de aca es el de "arranque en frio". Cada test ademas se lleva su
 * propia limpieza por fixture, para no depender del orden en que corran.
 */
import { dbConfig, mailpitUrl, ports } from './lib/config';
import { resetDatabase } from './lib/db';
import { startMailpit } from './lib/mailpit';

export default async function globalSetup(): Promise<void> {
  const state = await startMailpit();
  console.log(
    state === 'started'
      ? `  Mailpit arrancado: SMTP :${ports.smtp} — bandeja en ${mailpitUrl}`
      : `  Mailpit ya estaba corriendo en ${mailpitUrl}`,
  );

  const config = dbConfig();
  const tables = await resetDatabase(config);
  console.log(
    tables.length
      ? `  Base limpia: ${tables.length} tablas en ${config.database} (schema ${config.schema})`
      : `  Base sin tablas todavia: las crea la app al arrancar`,
  );
}
