/**
 * Unico comando de arranque: `npm run setup`.
 *
 * Idempotente de punta a punta: se puede correr las veces que haga falta. Cada
 * paso avisa si ya estaba hecho, y los errores explican como arreglarlos en vez
 * de tirar un stacktrace.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { E2E_DATABASE_NAME, E2E_SCHEMA_NAME, e2eEnv, ports } from '../lib/config';
import { tablesFromSchema } from '../lib/db';
import { generateE2eEnvFile } from '../lib/env-file';
import { ensureMailpit } from '../lib/mailpit';
import { e2eRoot, gitInfoExclude, repoRoot } from '../lib/paths';

const ok = (message: string) => console.log(`  \u2713 ${message}`);
const info = (message: string) => console.log(`    ${message}`);
const step = (title: string) => console.log(`\n${title}`);

/** Falla temprano y claro si a la maquina le falta algo del toolchain. */
function checkToolchain(): void {
  step('1. Entorno');

  const [major] = process.versions.node.split('.').map(Number);
  if ((major ?? 0) < 20) {
    throw new Error(`Node ${process.versions.node} es viejo para la suite. Hace falta 20 o mas.`);
  }
  ok(`Node ${process.versions.node}`);

  for (const command of ['mvn', 'java']) {
    try {
      execFileSync(command, ['-version'], { stdio: 'pipe', shell: true });
      ok(`${command} en el PATH`);
    } catch {
      throw new Error(
        `No encuentro "${command}" en el PATH. Sin eso la suite no puede levantar la app.`,
      );
    }
  }
}

/**
 * Prepara el lugar aislado para las tablas y deja la config escrita. Van juntos
 * porque la URL que se guarda depende de que permisos tenga el usuario de
 * Postgres de esta maquina.
 */
async function prepareStorage(): Promise<void> {
  step('2. Base de datos y configuracion (.env.e2e)');

  let generated;
  try {
    generated = await generateE2eEnvFile();
  } catch (error) {
    throw new Error(
      `No pude preparar la base.\n` +
        `    ¿Esta levantado tu Postgres y anda tu .env de desarrollo?\n` +
        `    Detalle: ${(error as Error).message}`,
    );
  }

  const { path, isolation, changed } = generated;
  const place =
    isolation.kind === 'database'
      ? `base propia "${E2E_DATABASE_NAME}"`
      : `schema propio "${E2E_SCHEMA_NAME}" dentro de tu base de desarrollo`;

  ok(`${isolation.created ? 'cree' : 'ya existia'} el lugar aislado: ${place}`);
  if (isolation.kind === 'schema') {
    info('tu usuario de Postgres no puede crear bases, asi que la suite usa un schema aparte');
  }
  info('tus datos de desarrollo no se tocan');

  ok(`config generada desde tu .env: ${path.replace(repoRoot, '.')}`);
  for (const [key, value] of Object.entries(changed)) info(`${key} = ${value}`);
  info(`${tablesFromSchema().length} tablas en schema.sql; las crea la app al arrancar`);
}

async function prepareMailpit(): Promise<void> {
  step('3. Mailpit (SMTP falso)');
  const binary = await ensureMailpit();
  ok(`binario listo: ${binary.replace(e2eRoot, '.')}`);
  info(`SMTP en :${ports.smtp} — API y UI en http://localhost:${ports.mailpit}`);
}

/**
 * La suite no puede terminar commiteada en el repo de la entrega. El setup lo
 * garantiza en vez de confiar en que cada uno se acuerde.
 */
function excludeFromParentRepo(): void {
  step('4. Repo de la app');
  const entry = 'e2e/';
  const current = existsSync(gitInfoExclude) ? readFileSync(gitInfoExclude, 'utf8') : '';
  if (current.split(/\r?\n/).includes(entry)) {
    ok('e2e/ ya esta en .git/info/exclude');
    return;
  }
  appendFileSync(
    gitInfoExclude,
    `\n# Suite de E2E (Playwright). Repo aparte, no forma parte de la entrega.\n${entry}\n`,
  );
  ok('e2e/ agregado a .git/info/exclude (local, no se commitea)');
}

async function main(): Promise<void> {
  console.log('Preparando la suite de E2E de Fuchibol\n' + '='.repeat(38));
  checkToolchain();
  await prepareStorage();
  await prepareMailpit();
  excludeFromParentRepo();

  console.log(
    `\nListo. La app de la suite corre en http://localhost:${ports.app}` +
      ` y el organizador es ${e2eEnv()['app.organizer-email'] ?? '(sin definir)'}.\n` +
      `\n  npm test         corre la suite (levanta Jetty y Mailpit solos)` +
      `\n  npm run test:ui  modo interactivo` +
      `\n  npm run seed     deja la base en un escenario para tocar a mano\n`,
  );
}

main().catch((error: Error) => {
  console.error(`\n\u2717 ${error.message}\n`);
  process.exit(1);
});
