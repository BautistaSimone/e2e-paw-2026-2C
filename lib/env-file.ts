/**
 * Generacion del `.env.e2e`.
 *
 * La clave de que esto ande en las 4 maquinas: no inventa credenciales ni
 * asume permisos. Parte del `.env` que a cada uno YA le funciona y pisa
 * unicamente lo que la suite necesita distinto (lugar aislado para las tablas,
 * SMTP falso, puerto propio). Si a alguien su Postgres le pide otro usuario o
 * no lo deja crear bases, se acomoda solo.
 */
import { writeFileSync } from 'node:fs';

import { baseUrl, ports, readEnvFile } from './config';
import { ensureIsolatedStorage, type Isolation } from './db';
import { devEnvFile, e2eEnvFile } from './paths';

export interface GeneratedEnv {
  path: string;
  isolation: Isolation;
  changed: Record<string, string>;
}

export async function generateE2eEnvFile(): Promise<GeneratedEnv> {
  const dev = readEnvFile(devEnvFile);
  const devUrl = dev['database.url'];
  if (!devUrl) {
    throw new Error(
      `No encuentro un .env usable en ${devEnvFile}.\n` +
        `Copia .env.example a .env y completalo con los datos de tu Postgres primero:\n` +
        `la suite se configura a partir de el.`,
    );
  }

  const isolation = await ensureIsolatedStorage(
    devUrl,
    dev['database.username'] ?? '',
    dev['database.password'] ?? '',
  );

  const changed: Record<string, string> = {
    'database.url': isolation.jdbcUrl,
    'mail.host': 'localhost',
    'mail.port': String(ports.smtp),
    'app.base-url': baseUrl,
  };

  const body = Object.entries({ ...dev, ...changed })
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  writeFileSync(
    e2eEnvFile,
    [
      '# ARCHIVO GENERADO por `npm run setup`. No lo edites a mano ni lo commitees.',
      '# Sale de tu .env de desarrollo, pisando solo lo que la suite necesita:',
      `#   tablas aisladas, SMTP de Mailpit y puerto ${ports.app}.`,
      '# Tu .env de desarrollo no se toca.',
      '',
      body,
      '',
    ].join('\n'),
  );

  return { path: e2eEnvFile, isolation, changed };
}
