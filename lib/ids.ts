/**
 * Los ids y el estado que la app no devuelve.
 *
 * Los controllers contestan `redirect:/mis-torneos?resultado=CREATED`, sin el id
 * de lo que se acaba de crear, y los ids de partidos e inscripciones solo viven
 * dentro del HTML de la pantalla de gestion. Scrapear ese HTML seria fragil, asi
 * que se consultan por SQL.
 *
 * Este es el UNICO modulo que lee la base para armar escenarios, y solo lee:
 * todo lo que escribe pasa por `lib/api`, o sea por la logica de negocio real.
 * (La unica excepcion de escritura en toda la suite es `promoteToAdmin` en
 * `lib/db.ts`, porque para el rol ADMIN no hay pantalla.)
 */
import { query } from './db';

export async function userIdByEmail(email: string): Promise<number> {
  const rows = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`No existe ningun usuario con email "${email}".`);
  return Number(id);
}

export interface UserRow {
  id: number;
  email: string;
  role: string;
  status: string;
  locale: string;
  displayName: string | null;
}

export async function userByEmail(email: string): Promise<UserRow> {
  const rows = await query<{
    id: string; email: string; role: string; status: string; locale: string; display_name: string | null;
  }>('SELECT id, email, role, status, locale, display_name FROM users WHERE email = $1', [email]);
  const row = rows[0];
  if (!row) throw new Error(`No existe ningun usuario con email "${email}".`);
  return {
    id: Number(row.id),
    email: row.email,
    role: row.role,
    status: row.status,
    locale: row.locale,
    displayName: row.display_name,
  };
}

export async function tournamentIdByName(name: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM tournaments WHERE name = $1 ORDER BY id DESC LIMIT 1',
    [name],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(`No existe ningun torneo llamado "${name}". Fallo la creacion?`);
  }
  return Number(id);
}

export interface RegistrationRow {
  id: number;
  teamId: number;
  teamName: string;
  captainId: number;
  status: string;
}

export async function registrationsOf(tournamentId: number): Promise<RegistrationRow[]> {
  const rows = await query<{
    id: string; team_id: string; team_name: string; captain_id: string; status: string;
  }>(
    `SELECT r.id, r.team_id, t.name AS team_name, t.captain_id, r.status
       FROM registrations r
       JOIN teams t ON t.id = r.team_id
      WHERE r.tournament_id = $1
      ORDER BY r.id`,
    [tournamentId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    teamId: Number(row.team_id),
    teamName: row.team_name,
    captainId: Number(row.captain_id),
    status: row.status,
  }));
}

/** Los jugadores de un equipo, para armar planillas con gente que exista. */
export async function rosterOf(teamId: number): Promise<UserRow[]> {
  const rows = await query<{
    id: string; email: string; role: string; status: string; locale: string; display_name: string | null;
  }>(
    `SELECT u.id, u.email, u.role, u.status, u.locale, u.display_name
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY u.id`,
    [teamId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    email: row.email,
    role: row.role,
    status: row.status,
    locale: row.locale,
    displayName: row.display_name,
  }));
}

export interface MatchRow {
  id: number;
  slot: number;
  roundId: number;
  roundNumber: number;
  roundLabel: string;
  homeRegistrationId: number | null;
  awayRegistrationId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  status: string;
  matchDate: string | null;
  startsAt: string | null;
  venue: string | null;
}

const MATCH_COLUMNS = `
    m.id, m.slot, m.round_id, cr.round_number, cr.label, m.status,
    m.home_registration_id, m.away_registration_id, m.home_goals, m.away_goals,
    m.match_date, m.starts_at, m.venue,
    home_team.name AS home_team, away_team.name AS away_team`;

const MATCH_JOINS = `
    FROM matches m
    JOIN competition_rounds cr ON cr.id = m.round_id
    LEFT JOIN registrations home_reg ON home_reg.id = m.home_registration_id
    LEFT JOIN teams home_team        ON home_team.id = home_reg.team_id
    LEFT JOIN registrations away_reg ON away_reg.id = m.away_registration_id
    LEFT JOIN teams away_team        ON away_team.id = away_reg.team_id`;

interface RawMatch {
  id: string; slot: number; round_id: string; round_number: number; label: string; status: string;
  home_registration_id: string | null; away_registration_id: string | null;
  home_goals: number | null; away_goals: number | null;
  match_date: Date | null; starts_at: string | null; venue: string | null;
  home_team: string | null; away_team: string | null;
}

const toMatch = (row: RawMatch): MatchRow => ({
  id: Number(row.id),
  slot: row.slot,
  roundId: Number(row.round_id),
  roundNumber: row.round_number,
  roundLabel: row.label,
  homeRegistrationId: row.home_registration_id === null ? null : Number(row.home_registration_id),
  awayRegistrationId: row.away_registration_id === null ? null : Number(row.away_registration_id),
  homeTeam: row.home_team,
  awayTeam: row.away_team,
  homeGoals: row.home_goals,
  awayGoals: row.away_goals,
  status: row.status,
  // El driver devuelve un Date para DATE; los tests comparan contra ISO.
  matchDate: row.match_date === null ? null : toIsoDate(row.match_date),
  startsAt: row.starts_at,
  venue: row.venue,
});

const toIsoDate = (value: Date | string): string =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/**
 * Partidos de la fecha en juego. Es lo que necesita cualquier escenario que
 * quiera cargar resultados sin abrir la pantalla.
 */
export async function currentRoundMatches(tournamentId: number): Promise<MatchRow[]> {
  const rows = await query<RawMatch>(
    `SELECT ${MATCH_COLUMNS} ${MATCH_JOINS}
      WHERE cr.tournament_id = $1 AND cr.status = 'CURRENT'
      ORDER BY cr.round_number, m.slot`,
    [tournamentId],
  );
  return rows.map(toMatch);
}

/** Todos los partidos del torneo, jugados o no. */
export async function matchesOf(tournamentId: number): Promise<MatchRow[]> {
  const rows = await query<RawMatch>(
    `SELECT ${MATCH_COLUMNS} ${MATCH_JOINS}
      WHERE cr.tournament_id = $1
      ORDER BY cr.round_number, m.slot`,
    [tournamentId],
  );
  return rows.map(toMatch);
}

export interface RoundRow {
  id: number;
  roundNumber: number;
  label: string;
  phase: string;
  status: string;
  groupNumber: number | null;
}

export async function roundsOf(tournamentId: number): Promise<RoundRow[]> {
  const rows = await query<{
    id: string; round_number: number; label: string; phase: string; status: string;
    group_number: number | null;
  }>(
    `SELECT id, round_number, label, phase, status, group_number
       FROM competition_rounds WHERE tournament_id = $1
      ORDER BY round_number, group_number`,
    [tournamentId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    roundNumber: row.round_number,
    label: row.label,
    phase: row.phase,
    status: row.status,
    groupNumber: row.group_number,
  }));
}

export interface EventRow {
  id: number;
  matchId: number;
  registrationId: number;
  playerId: number;
  playerEmail: string;
  type: string;
  assistPlayerId: number | null;
  minute: number | null;
}

/** Los eventos cargados en la planilla de un partido. */
export async function eventsOf(matchId: number): Promise<EventRow[]> {
  const rows = await query<{
    id: string; match_id: string; registration_id: string; player_id: string; email: string;
    type: string; assist_player_id: string | null; minute: number | null;
  }>(
    `SELECT e.id, e.match_id, e.registration_id, e.player_id, u.email,
            e.type, e.assist_player_id, e.minute
       FROM match_events e
       JOIN users u ON u.id = e.player_id
      WHERE e.match_id = $1
      ORDER BY e.id`,
    [matchId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    matchId: Number(row.match_id),
    registrationId: Number(row.registration_id),
    playerId: Number(row.player_id),
    playerEmail: row.email,
    type: row.type,
    assistPlayerId: row.assist_player_id === null ? null : Number(row.assist_player_id),
    minute: row.minute,
  }));
}

/** Estado del torneo, para afirmar sin depender de como lo pinta la pantalla. */
export async function tournamentStatus(tournamentId: number): Promise<string> {
  const rows = await query<{ status: string }>('SELECT status FROM tournaments WHERE id = $1', [
    tournamentId,
  ]);
  const status = rows[0]?.status;
  if (status === undefined) throw new Error(`No existe el torneo ${tournamentId}.`);
  return status;
}

/** El equipo campeon, que la app guarda al cerrar el torneo. Null si sigue abierto. */
export async function championOf(tournamentId: number): Promise<string | null> {
  const rows = await query<{ name: string }>(
    `SELECT te.name
       FROM tournaments t
       JOIN registrations r ON r.id = t.champion_registration_id
       JOIN teams te        ON te.id = r.team_id
      WHERE t.id = $1`,
    [tournamentId],
  );
  return rows[0]?.name ?? null;
}
