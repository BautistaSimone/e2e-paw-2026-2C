/**
 * Como levantar la app. Todo lo que sabe la suite sobre Maven vive aca.
 *
 * Dos detalles que costaron encontrar y por eso estan explicados:
 *
 * 1. El prefijo corto `jetty:run` no resuelve desde la raiz del repo: el plugin
 *    esta declarado solo en el pom de `webapp`. Se usan las coordenadas
 *    completas, y la version se lee del pom para que no quede duplicada aca.
 * 2. El pom fija `database.env-file` con un <systemProperty> del plugin, pero la
 *    documentacion del mojo aclara que esos valores NO pisan una system property
 *    puesta en la linea de comandos. Por eso el -D de abajo gana y la app
 *    arranca contra el .env.e2e sin tocar un solo archivo del repo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ports } from './config';
import { e2eEnvFile, repoRoot, webappModule } from './paths';

const JETTY_PLUGIN = 'org.eclipse.jetty:jetty-maven-plugin';

/** Version del plugin de Jetty, leida del pom de webapp. */
export function jettyPluginVersion(): string {
  const pom = readFileSync(path.join(webappModule, 'pom.xml'), 'utf8');
  const match = /<artifactId>jetty-maven-plugin<\/artifactId>\s*<version>([^<]+)<\/version>/.exec(pom);
  if (!match) {
    throw new Error(
      `No encontre la version de jetty-maven-plugin en el pom de webapp.\n` +
        `Si la movieron al pom padre, actualiza lib/maven.ts.`,
    );
  }
  return match[1]!.trim();
}

/** Comando que levanta la app de la suite. Se corre desde la raiz del repo. */
export function jettyCommand(): string {
  return [
    'mvn',
    '-q',
    '-pl', 'webapp',
    '-am',
    `${JETTY_PLUGIN}:${jettyPluginVersion()}:run`,
    `-Djetty.http.port=${ports.app}`,
    `-Ddatabase.env-file="${e2eEnvFile}"`,
  ].join(' ');
}

export const mavenCwd = repoRoot;
