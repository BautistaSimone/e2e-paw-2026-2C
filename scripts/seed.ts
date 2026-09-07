/**
 * Deja la base en un escenario y te dice a donde ir a mirarlo.
 *
 * Reemplaza los diez minutos de cargar datos a mano antes de poder ver una
 * pantalla. Aunque no se escribiera un solo `expect`, esto solo ya justifica la
 * suite:
 *
 *   npm run seed -- inProgress --teams 6 --round 2
 *   npm run seed -- readyToStart --name "Copa Prueba"
 *   npm run seed -- finished --keep      (no vacia lo que ya habia)
 */
import { request } from '@playwright/test';

import { requireApp } from '../lib/app';
import { baseUrl, mailpitUrl } from '../lib/config';
import { resetDatabase } from '../lib/db';
import * as scenarios from '../scenarios';

const RECIPES = {
  draft: scenarios.draftTournament,
  open: scenarios.openForRegistration,
  withPendingTeams: scenarios.withPendingTeams,
  readyToStart: scenarios.readyToStart,
  inProgress: scenarios.inProgress,
  finished: scenarios.finished,
} as const;

type RecipeName = keyof typeof RECIPES;

/** Flags sin valor: el resto consume el argumento siguiente como su valor. */
const BOOLEAN_FLAGS = new Set(['keep']);

function parseArgs(argv: string[]): {
  recipe: RecipeName;
  options: scenarios.ScenarioOptions & { round?: number };
  keep: boolean;
} {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, 'true');
      continue;
    }
    // El valor del flag se consume aca; si no, "--teams 6" dejaba el 6 suelto
    // y terminaba tomandose como el nombre del torneo.
    flags.set(name, argv[++i] ?? '');
  }

  const recipe = positional[0] ?? 'inProgress';
  if (!(recipe in RECIPES)) {
    throw new Error(
      `No conozco el escenario "${recipe}".
Disponibles: ${Object.keys(RECIPES).join(', ')}`,
    );
  }

  const number = (name: string): number | undefined => {
    const value = flags.get(name);
    return value === undefined ? undefined : Number(value);
  };

  return {
    recipe: recipe as RecipeName,
    options: {
      name: flags.get('name') ?? positional[1],
      teams: number('teams'),
      round: number('round'),
      maxTeams: number('maxTeams'),
      format: flags.get('format') as scenarios.ScenarioOptions['format'],
    },
    keep: flags.has('keep'),
  };
}

const { recipe, options, keep } = parseArgs(process.argv.slice(2));
await requireApp();

if (!keep) {
  const tables = await resetDatabase();
  console.log(`Base vaciada (${tables.length} tablas).`);
}

const context = await request.newContext({ baseURL: baseUrl });
try {
  const tournament = await RECIPES[recipe](context, options);
  console.log(
    `\nEscenario "${recipe}" listo: ${tournament.name} (id ${tournament.id})\n` +
      `\n  Detalle publico   ${baseUrl}/torneos/${tournament.id}` +
      `\n  Gestion           ${baseUrl}/adminPanel/torneos/${tournament.id}/gestion` +
      `\n  Mails             ${mailpitUrl}\n`,
  );
} finally {
  await context.dispose();
}
