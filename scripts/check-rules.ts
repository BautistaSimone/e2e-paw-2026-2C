/**
 * Chequea las tres reglas de modularidad de la suite.
 *
 * No es un linter de estilo: son las tres reglas que, si se rompen, hacen que
 * la suite deje de andar en la maquina de otro o que un cambio de pantalla
 * rompa veinte tests en vez de un archivo.
 *
 *   npm run check:rules
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { e2eRoot } from '../lib/paths';

interface Rule {
  name: string;
  /** Que se busca (sobre el codigo, ya sin comentarios ni imports). */
  pattern: RegExp;
  /** Unicos archivos donde ese patron esta permitido. */
  allowed: string[];
  /** Donde se busca. */
  scope: string[];
  fix: string;
}

/**
 * Este mismo archivo queda afuera: contiene los patrones que busca, asi que se
 * denunciaria solo en cada corrida.
 */
const SELF = 'scripts/check-rules.ts';

const RULES: Rule[] = [
  {
    name: 'Ningun path absoluto ni process.cwd() fuera de lib/paths.ts',
    pattern: /(process\.cwd\(\)|['"][A-Za-z]:[\/]|['"]\/(Users|home)\/)/,
    allowed: ['lib/paths.ts'],
    scope: ['lib', 'pages', 'scenarios', 'scripts', 'tests'],
    fix: 'Deriva la ruta de un export de lib/paths.ts (repoRoot, e2eRoot, ...).',
  },
  {
    name: 'Ningun puerto ni URL literal fuera de lib/config.ts',
    pattern: /(https?:\/\/localhost|:(8080|8081|1025|8025)\b)/,
    allowed: ['lib/config.ts'],
    scope: ['lib', 'pages', 'scenarios', 'scripts', 'tests'],
    fix: 'Usa baseUrl / mailpitUrl / ports de lib/config.ts, que respetan las env vars.',
  },
  {
    name: 'Ningun selector CSS fuera de pages/',
    pattern: /\.(locator|\$\$?)\(/,
    allowed: [],
    scope: ['tests', 'scenarios'],
    fix: 'Agrega un metodo al page object correspondiente y llamalo desde el test.',
  },
];

/** Se sacan comentarios e imports: ahi los literales son documentacion, no codigo. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|import\b|export .* from )/.test(line))
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function walk(dir: string): string[] {
  const full = path.join(e2eRoot, dir);
  try {
    return readdirSync(full).flatMap((entry) => {
      const child = path.join(full, entry);
      if (statSync(child).isDirectory()) return walk(path.join(dir, entry));
      if (!entry.endsWith('.ts')) return [];
      return [path.posix.join(dir.split(path.sep).join('/'), entry)];
    });
  } catch {
    return [];
  }
}

let violations = 0;
for (const rule of RULES) {
  const files = rule.scope
    .flatMap(walk)
    .filter((file) => file !== SELF && !rule.allowed.includes(file));
  const broken = files.filter((file) => rule.pattern.test(code(path.join(e2eRoot, file))));

  if (broken.length === 0) {
    console.log(`\u2713 ${rule.name}`);
    continue;
  }
  violations += broken.length;
  console.log(`\u2717 ${rule.name}`);
  for (const file of broken) console.log(`    ${file}`);
  console.log(`    -> ${rule.fix}`);
}

if (violations > 0) {
  console.log(`\n${violations} archivo(s) rompen una regla.`);
  process.exit(1);
}
console.log('\nLas tres reglas se cumplen.');
