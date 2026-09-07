/**
 * Graba un flujo clickeando y escupe el codigo del test.
 *
 * Arranca contra la app de la suite (no la de desarrollo), asi lo que se graba
 * corre despues igual en los tests.
 */
import { spawn } from 'node:child_process';

import { baseUrl } from '../lib/config';
import { requireApp } from '../lib/app';

await requireApp();
console.log(`Grabando contra ${baseUrl}. Cerra la ventana para terminar.\n`);

const child = spawn('npx', ['playwright', 'codegen', baseUrl], { shell: true, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
