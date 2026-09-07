/**
 * Unico modulo del proyecto que puede armar rutas del filesystem.
 *
 * Regla: si en cualquier otro archivo aparece un path absoluto, un `..` o un
 * `process.cwd()`, esta mal. Todo cuelga de `repoRoot`, que se deduce en
 * runtime desde la ubicacion de este archivo, asi la suite anda igual en
 * C:\Users\quien-sea\ que en ~/facultad/ y sin importar desde que carpeta se
 * lance el comando.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);

/** Raiz del proyecto de E2E (la carpeta `e2e/`). */
export const e2eRoot = path.resolve(path.dirname(thisFile), '..');

/**
 * Raiz del repo de la app. Es la carpeta que contiene a `e2e/`, pero no se
 * asume: se verifica que ahi viva el pom padre. Si alguien mueve la carpeta,
 * el error explica que pasa en vez de fallar 20 pasos despues con un ENOENT.
 */
export const repoRoot = (() => {
  const candidate = path.resolve(e2eRoot, '..');
  if (!existsSync(path.join(candidate, 'pom.xml'))) {
    throw new Error(
      `No encuentro el repo de la app en ${candidate} (no hay pom.xml).\n` +
        `La suite tiene que estar clonada dentro del repo, como <repo>/e2e/.`,
    );
  }
  return candidate;
})();

/** `.env` de desarrollo de cada uno. De aca sale la config de su Postgres. */
export const devEnvFile = path.join(repoRoot, '.env');

/** `.env` que usa la app cuando la levanta la suite. Lo genera el setup. */
export const e2eEnvFile = path.join(e2eRoot, '.env.e2e');

/** Binarios bajados por plataforma (mailpit). Gitignored. */
export const toolsDir = path.join(e2eRoot, 'tools');

/** Schema real de la app: de aca sale la lista de tablas para el reset. */
export const schemaSql = path.join(
  repoRoot,
  'persistence', 'src', 'main', 'resources', 'schema.sql',
);

/** Exclude local del repo padre: ahi se agrega `e2e/` para no commitearla. */
export const gitInfoExclude = path.join(repoRoot, '.git', 'info', 'exclude');

/** Modulo de la webapp, cwd de los comandos de Maven. */
export const webappModule = path.join(repoRoot, 'webapp');
