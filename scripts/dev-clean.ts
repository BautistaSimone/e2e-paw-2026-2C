/**
 * Vacia la base de DESARROLLO conservando los usuarios.
 *
 * Es lo contrario de `db-reset.ts`: aquel vacia el lugar aislado de la suite
 * (schema `e2e`) y lo corren los tests solos; este toca la base con la que
 * trabaja la app todos los dias (schema `public` del `.env` de desarrollo) y
 * lo corre una persona a mano cuando los datos de prueba acumulados molestan.
 *
 * Que sobrevive:
 *   - `users`, menos los PENDING. Un PENDING no es una cuenta: lo crea el
 *     capitan al tipear el mail de un companero, no tiene password y solo
 *     existe como placeholder de un plantel que aca se borra.
 *   - `images`, solo las que siguen siendo avatar de alguien. Las portadas de
 *     torneo se van con sus torneos.
 *
 * Sin `--yes` es un dry-run: informa que haria y no escribe nada.
 */
import { dbConfig, devEnv } from '../lib/config';
import { withClient } from '../lib/db';

/** Tablas que se vacian enteras, todas las que se referencian entre si. */
const WIPED = [
  'match_events',
  'matches',
  'competition_rounds',
  'competition_groups',
  'registrations',
  'tournaments',
  'team_members',
  'teams',
] as const;

interface Count {
  tabla: string;
  filas: number;
}

const confirmed = process.argv.includes('--yes');
const config = dbConfig(devEnv());

if (config.schema !== 'public') {
  throw new Error(
    `El .env de desarrollo apunta al schema "${config.schema}" y esperaba "public".\n` +
      `No sigo: este script borra datos y no quiero tocar el schema equivocado.`,
  );
}

await withClient(config, async (client) => {
  const counts = async (): Promise<Count[]> => {
    const { rows } = await client.query<Count>(
      `SELECT 'users (total)' AS tabla, COUNT(*)::int AS filas FROM users
       UNION ALL SELECT 'users (PENDING, se borran)', COUNT(*)::int FROM users WHERE status = 'PENDING'
       UNION ALL SELECT 'images (total)', COUNT(*)::int FROM images
       UNION ALL SELECT 'images (avatar, se conservan)', COUNT(*)::int FROM images i
                   WHERE EXISTS (SELECT 1 FROM users u WHERE u.avatar_image_id = i.id)
       ${WIPED.map((table) => `UNION ALL SELECT '${table}', COUNT(*)::int FROM ${table}`).join('\n       ')}`,
    );
    return rows;
  };

  console.log(`Base ${config.database}, schema ${config.schema} (el .env de desarrollo).\n`);
  for (const row of await counts()) {
    console.log(`  ${row.tabla.padEnd(30)} ${String(row.filas).padStart(5)}`);
  }

  const { rows: survivors } = await client.query<{ id: number; email: string; role: string }>(
    `SELECT id, email, role FROM users WHERE status <> 'PENDING' ORDER BY id`,
  );
  console.log(`\nUsuarios que sobreviven (${survivors.length}):`);
  for (const user of survivors) {
    console.log(`  #${user.id} ${user.email} (${user.role})`);
  }

  if (!confirmed) {
    console.log('\nEsto fue un ensayo: no toque nada. Corre con --yes para borrar de verdad.');
    return;
  }

  // Una sola transaccion: o queda todo consistente o no se borro nada.
  await client.query('BEGIN');
  try {
    // Sin CASCADE a proposito. La lista de arriba ya incluye todas las tablas
    // que se referencian entre si, asi que si manana aparece una tabla nueva
    // que apunte a estas, Postgres falla ruidosamente en vez de vaciarla en
    // silencio.
    await client.query(`TRUNCATE ${WIPED.join(', ')} RESTART IDENTITY`);
    await client.query(`DELETE FROM users WHERE status = 'PENDING'`);
    // Despues del DELETE anterior, para que se lleve tambien los avatares de
    // los usuarios borrados.
    await client.query(
      `DELETE FROM images i WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_image_id = i.id)`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  console.log('\nListo. Como quedo:\n');
  for (const row of await counts()) {
    console.log(`  ${row.tabla.padEnd(30)} ${String(row.filas).padStart(5)}`);
  }
});
