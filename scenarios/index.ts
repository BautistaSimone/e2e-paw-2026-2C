/**
 * Escenarios: estados de negocio con nombre.
 *
 * Es la capa que hace que un test empiece donde importa. Llegar a "torneo en
 * curso, fecha 2, con resultados cargados" a mano son ~30 clicks; aca es una
 * linea y ~1 segundo, porque va por los mismos endpoints que usa el browser.
 *
 * Solo compone `lib/api` y `lib/ids`: no conoce URLs, ni HTML, ni selectores.
 */
import type { APIRequestContext } from '@playwright/test';

import * as api from '../lib/api';
import { currentRoundMatches, registrationsOf, tournamentIdByName } from '../lib/ids';
import type { MatchRow } from '../lib/ids';

export interface TeamRef {
  name: string;
  captainEmail: string;
}

export interface TournamentRef {
  id: number;
  name: string;
  teams: TeamRef[];
}

export interface ScenarioOptions {
  name?: string;
  teams?: number;
  format?: api.TournamentFormat;
  maxTeams?: number;
}

/**
 * Nombre unico por corrida. Sin esto, dos tests que crean "Torneo de prueba"
 * se pisan y el segundo encuentra el torneo del primero.
 */
let sequence = 0;
const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}-${++sequence}`;

const teamsFor = (count: number, suffix: string): TeamRef[] =>
  Array.from({ length: count }, (_, index) => ({
    name: `Equipo ${index + 1} ${suffix}`,
    captainEmail: `capitan${index + 1}.${suffix}@fuchibol.test`,
  }));

/** Torneo recien creado: en DRAFT, sin inscripciones abiertas. */
export async function draftTournament(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const name = options.name ?? uniqueName('Torneo');
  await api.createTournament(request, {
    name,
    format: options.format ?? 'LEAGUE',
    maxTeams: options.maxTeams ?? Math.max(options.teams ?? 4, 4),
  });
  const id = await tournamentIdByName(name);
  return { id, name, teams: [] };
}

/** Torneo publicado, con las inscripciones abiertas y todavia sin equipos. */
export async function openForRegistration(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await draftTournament(request, options);
  await api.publish(request, tournament.id);
  return tournament;
}

/**
 * Torneo publicado con N equipos anotados. Quedan PENDING, que es como los deja
 * la app: el organizador todavia tiene que aceptarlos.
 */
export async function withPendingTeams(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await openForRegistration(request, options);
  const teams = teamsFor(options.teams ?? 4, tournament.id.toString(36));
  for (const team of teams) {
    await api.joinTournament(request, tournament.id, team.name, team.captainEmail);
  }
  return { ...tournament, teams };
}

/** Lo mismo, pero con todas las inscripciones ya aceptadas: listo para iniciar. */
export async function readyToStart(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await withPendingTeams(request, options);
  for (const registration of await registrationsOf(tournament.id)) {
    if (registration.status === 'PENDING') {
      await api.resolveRegistration(request, tournament.id, registration.id, 'ACTIVE');
    }
  }
  return tournament;
}

/**
 * Torneo en juego, parado en la fecha `round` sin resultados cargados.
 * `inProgress(request, { round: 3 })` juega las fechas 1 y 2 y deja la 3 abierta.
 */
export async function inProgress(
  request: APIRequestContext,
  options: ScenarioOptions & { round?: number } = {},
): Promise<TournamentRef> {
  const tournament = await readyToStart(request, options);
  await api.startTournament(request, tournament.id);

  for (let played = 1; played < (options.round ?? 1); played++) {
    await playCurrentRound(request, tournament.id);
    await api.advance(request, tournament.id);
  }
  return tournament;
}

/** Torneo jugado hasta el final. */
export async function finished(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await inProgress(request, options);
  // Tope de seguridad: si `advance` dejara de cerrar el torneo, el test falla
  // por el assert que corresponda y no colgado en un while infinito.
  for (let round = 0; round < 32; round++) {
    const matches = await currentRoundMatches(tournament.id);
    if (matches.length === 0) break;
    await playCurrentRound(request, tournament.id);
    await api.advance(request, tournament.id);
  }
  return tournament;
}

/**
 * Carga la planilla completa de la fecha en juego. La app exige exactamente los
 * partidos jugables de la fecha (los BYE no se cargan), asi que se manda eso.
 *
 * Gana siempre el local 2-1: sin empates, una eliminacion nunca queda esperando
 * que alguien elija quien paso.
 */
export async function playCurrentRound(
  request: APIRequestContext,
  tournamentId: number,
  score: { home: number; away: number } = { home: 2, away: 1 },
): Promise<MatchRow[]> {
  const matches = (await currentRoundMatches(tournamentId)).filter(
    (match) => match.status !== 'BYE' && match.homeRegistrationId !== null,
  );
  if (matches.length === 0) {
    throw new Error(`El torneo ${tournamentId} no tiene una fecha en juego para cargar.`);
  }
  await api.saveResults(
    request,
    tournamentId,
    matches.map((match) => ({
      matchId: match.id,
      homeGoals: score.home,
      awayGoals: score.away,
    })),
  );
  return matches;
}
