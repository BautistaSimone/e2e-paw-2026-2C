/**
 * Escenarios: estados de negocio con nombre.
 *
 * Es la capa que hace que un test empiece donde importa. Llegar a "torneo en
 * curso, fecha 2, con resultados cargados" a mano son ~30 clicks y tres
 * usuarios registrados; aca es una linea y un par de segundos, porque va por
 * los mismos endpoints que usa el browser.
 *
 * Solo compone `lib/api`, `lib/actors` y `lib/ids`: no conoce URLs, ni HTML, ni
 * selectores.
 *
 * Lo que cambio respecto del sprint 1: ahora hay usuarios. Cada torneo tiene un
 * dueño y cada equipo un capitan, y son actores de verdad — cuentas registradas
 * con su propia sesion — porque la app dejo de aceptar un email suelto como
 * parametro.
 */
import * as api from '../lib/api';
import type { Actor, ActorFactory } from '../lib/actors';
import { rosterOf, currentRoundMatches, registrationsOf, roundsOf, tournamentIdByName } from '../lib/ids';
import type { MatchRow, RegistrationRow, UserRow } from '../lib/ids';

export interface TeamRef {
  name: string;
  captain: Actor;
  /** Los companeros que el capitan cargo en el plantel, si pidio plantel. */
  players: string[];
}

export interface TournamentRef {
  id: number;
  name: string;
  owner: Actor;
  teams: TeamRef[];
}

export interface ScenarioOptions {
  name?: string;
  teams?: number;
  format?: api.TournamentFormat;
  maxTeams?: number;
  playersPerSide?: api.PlayersPerSide;
  /** Dueño del torneo. Si no se pasa, el escenario registra uno. */
  owner?: Actor;
  /** Companeros por equipo, ademas del capitan. Hace falta para las planillas. */
  playersPerTeam?: number;
}

/**
 * Nombre unico por corrida. Sin esto, dos tests que crean "Torneo de prueba"
 * se pisan y el segundo encuentra el torneo del primero.
 */
let sequence = 0;
const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}-${++sequence}`;

/** Torneo recien creado: en DRAFT, sin inscripciones abiertas. */
export async function draftTournament(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const owner = options.owner ?? (await actors.register('organizador'));
  const name = options.name ?? uniqueName('Torneo');
  await api.createTournament(owner.request, {
    name,
    format: options.format ?? 'LEAGUE',
    maxTeams: options.maxTeams ?? Math.max(options.teams ?? 4, 4),
    playersPerSide: options.playersPerSide,
  });
  return { id: await tournamentIdByName(name), name, owner, teams: [] };
}

/** Torneo publicado, con las inscripciones abiertas y todavia sin equipos. */
export async function openForRegistration(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await draftTournament(actors, options);
  await api.publish(tournament.owner.request, tournament.id);
  return tournament;
}

/**
 * Torneo publicado con N equipos anotados. Quedan PENDING, que es como los deja
 * la app: el organizador todavia tiene que aceptarlos.
 *
 * Cada equipo se anota con su propio capitan registrado, porque la app toma al
 * capitan del usuario autenticado y rechaza que uno se anote dos veces.
 */
export async function withPendingTeams(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await openForRegistration(actors, options);
  const count = options.teams ?? 4;
  const suffix = tournament.id.toString(36);
  const teams: TeamRef[] = [];

  for (let index = 1; index <= count; index++) {
    const captain = await actors.register(`capitan${index}.${suffix}`);
    const players = Array.from(
      { length: options.playersPerTeam ?? 0 },
      (_, player) => `jugador${player + 1}.e${index}.${suffix}@fuchibol.test`,
    );
    const name = `Equipo ${index} ${suffix}`;
    await api.joinTournament(captain.request, tournament.id, name, { players });
    teams.push({ name, captain, players });
  }

  return { ...tournament, teams };
}

/** Lo mismo, pero con todas las inscripciones ya aceptadas: listo para iniciar. */
export async function readyToStart(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await withPendingTeams(actors, options);
  await acceptPendingTeams(tournament);
  return tournament;
}

/** Acepta todas las inscripciones pendientes de un torneo ya armado. */
export async function acceptPendingTeams(tournament: TournamentRef): Promise<RegistrationRow[]> {
  const registrations = await registrationsOf(tournament.id);
  for (const registration of registrations) {
    if (registration.status === 'PENDING') {
      await api.resolveRegistration(
        tournament.owner.request,
        tournament.id,
        registration.id,
        'ACTIVE',
      );
    }
  }
  return registrationsOf(tournament.id);
}

/**
 * Torneo en juego, parado en la fecha `round` sin resultados cargados.
 * `inProgress(actors, { round: 3 })` juega las fechas 1 y 2 y deja la 3 abierta.
 */
export async function inProgress(
  actors: ActorFactory,
  options: ScenarioOptions & { round?: number } = {},
): Promise<TournamentRef> {
  const tournament = await readyToStart(actors, options);
  await api.startTournament(tournament.owner.request, tournament.id);

  for (let played = 1; played < (options.round ?? 1); played++) {
    await playCurrentRound(tournament);
    await api.advance(tournament.owner.request, tournament.id);
  }
  return tournament;
}

/** Torneo jugado hasta el final. */
export async function finished(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<TournamentRef> {
  const tournament = await inProgress(actors, options);
  // Tope de seguridad: si `advance` dejara de cerrar el torneo, el test falla
  // por el assert que corresponda y no colgado en un while infinito.
  for (let round = 0; round < 32; round++) {
    const matches = await currentRoundMatches(tournament.id);
    if (matches.length === 0) break;
    await playCurrentRound(tournament);
    await api.advance(tournament.owner.request, tournament.id);
  }
  return tournament;
}

/**
 * Torneo en juego con la fecha actual ya agendada (dia, hora y cancha).
 * Cada partido va a una cancha distinta para no chocar con el UNIQUE de
 * `matches_schedule_unique`.
 */
export async function scheduled(
  actors: ActorFactory,
  options: ScenarioOptions & { date?: string; startsAt?: string } = {},
): Promise<TournamentRef> {
  const tournament = await inProgress(actors, options);
  const matches = playableMatches(await currentRoundMatches(tournament.id));
  const roundId = matches[0]?.roundId;
  if (roundId === undefined) throw new Error(`El torneo ${tournament.id} no tiene fecha en juego.`);

  await api.saveSchedule(
    tournament.owner.request,
    tournament.id,
    roundId,
    matches.map((match, index) => ({
      matchId: match.id,
      date: options.date ?? api.inDays(api.DEFAULT_START_IN_DAYS + 1),
      startsAt: options.startsAt ?? '19:00',
      // Solo hay tres canchas (1, 2 y 3) y no pueden repetirse en el mismo
      // horario, asi que se reparten ciclicamente.
      venue: String((index % 3) + 1),
    })),
  );
  return tournament;
}

/**
 * Torneo con el primer partido de la fecha jugado y su planilla cargada: un gol
 * del local con asistencia, una amarilla y la figura. Devuelve el partido y sus
 * planteles para que el test pueda afirmar sobre jugadores concretos.
 */
export async function withMatchSheet(
  actors: ActorFactory,
  options: ScenarioOptions = {},
): Promise<{
  tournament: TournamentRef;
  match: MatchRow;
  scorer: UserRow;
  assistant: UserRow;
}> {
  const tournament = await inProgress(actors, { playersPerTeam: 2, ...options });
  const match = playableMatches(await currentRoundMatches(tournament.id))[0];
  if (!match) throw new Error(`El torneo ${tournament.id} no tiene partidos jugables.`);

  await api.saveResults(tournament.owner.request, tournament.id, [
    { matchId: match.id, homeGoals: 1, awayGoals: 0 },
  ]);

  const registrations = await registrationsOf(tournament.id);
  const home = registrations.find((row) => row.id === match.homeRegistrationId);
  if (!home) throw new Error(`No encuentro la inscripcion local del partido ${match.id}.`);
  const roster = await rosterOf(home.teamId);
  const [scorer, assistant] = roster;
  if (!scorer || !assistant) {
    throw new Error(`El equipo ${home.teamName} necesita al menos 2 jugadores para la planilla.`);
  }

  await api.saveSheet(tournament.owner.request, tournament.id, match.id, {
    homeGoals: [{ scorerId: scorer.id, assistId: assistant.id, minute: 23 }],
    cards: [{ playerId: assistant.id, type: 'YELLOW_CARD', minute: 40 }],
    mvpId: scorer.id,
  });

  return { tournament, match, scorer, assistant };
}

/** Los partidos que se pueden cargar: los BYE no llevan resultado. */
export const playableMatches = (matches: MatchRow[]): MatchRow[] =>
  matches.filter((match) => match.status !== 'BYE' && match.homeRegistrationId !== null
    && match.awayRegistrationId !== null);

/** La fecha en juego, para agendarla o afirmar sobre ella. */
export async function currentRound(tournamentId: number) {
  const rounds = await roundsOf(tournamentId);
  return rounds.find((round) => round.status === 'CURRENT');
}

/**
 * Carga la planilla completa de la fecha en juego. La app exige exactamente los
 * partidos jugables de la fecha (los BYE no se cargan), asi que se manda eso.
 *
 * Gana siempre el local 2-1: sin empates, una eliminacion nunca queda esperando
 * que alguien elija quien paso.
 */
export async function playCurrentRound(
  tournament: TournamentRef,
  score: { home: number; away: number } = { home: 2, away: 1 },
): Promise<MatchRow[]> {
  const matches = playableMatches(await currentRoundMatches(tournament.id));
  if (matches.length === 0) {
    throw new Error(`El torneo ${tournament.id} no tiene una fecha en juego para cargar.`);
  }
  await api.saveResults(
    tournament.owner.request,
    tournament.id,
    matches.map((match) => ({
      matchId: match.id,
      homeGoals: score.home,
      awayGoals: score.away,
    })),
  );
  return matches;
}
