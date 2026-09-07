/**
 * Levanta la app con la config de la suite y la deja corriendo.
 * Es el mismo comando que usa Playwright, para que no haya dos formas distintas.
 */
import { spawn } from 'node:child_process';

import { baseUrl, mailpitUrl } from '../lib/config';
import { jettyCommand, mavenCwd } from '../lib/maven';
import { startMailpit } from '../lib/mailpit';

await startMailpit();
console.log(`Levantando la app en ${baseUrl} (bandeja de mails en ${mailpitUrl})`);
console.log(`> ${jettyCommand()}\n`);

const child = spawn(jettyCommand(), { cwd: mavenCwd, shell: true, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
