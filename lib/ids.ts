/**
 * Los ids que la app no devuelve.
 *
 * Los controllers contestan `redirect:/adminPanel?resultado=CREATED`, sin el id
 * de lo que se acaba de crear, y los ids de partidos e inscripciones solo viven
 * dentro del HTML de la pantalla de gestion. Scrapear ese HTML seria fragil, asi
 * que se consultan por SQL.
 *
 * Este es el UNICO modulo que lee la base para armar escenarios, y solo lee:
 * todo lo que escribe pasa por `lib/api`, o sea por la logica de negocio real.
 */
import { query } from './db';

export async function tournamentIdByName(name: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM tournaments WHERE name = $1 ORDER BY id DESC LIMIT 1',
    [name],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(`No existe ningun torneo llamado "${name}". ¿Fallo la creacion?`);
  }
  return Number(id);
}

export interface RegistrationRow {
  id: number;
  teamName: string;
  status: string;
}

export async function registrationsOf(tournamentId: number): Promise<RegistrationRow[]> {
  const rows = await query<{ id: string; team_name: string; status: string }>(
    `SELECT r.id, t.name AS team_name, r.status
       FROM registrations r
       JOIN teams t ON t.id = r.team_id
      WHERE r.tournament_id = $1
      ORDER BY r.id`,
    [tournamentId],
  );
  return rows.map((row) => ({ id: Number(row.id), teamName: row.team_name, status: row.status }));
}

export interface MatchRow {
  id: number;
  slot: number;
  roundId: number;
  roundLabel: string;
  homeRegistrationId: number | null;
  awayRegistrationId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  status: string;
}

/**
 * Partidos de la fecha en juego. Es lo que necesita cualquier escenario que
 * quiera cargar resultados sin abrir la pantalla.
 */
export async function currentRoundMatches(tournamentId: number): Promise<MatchRow[]> {
  const rows = await query<{
    id: string; slot: number; round_id: string; label: string;
    home_registration_id: string | null; away_registration_id: string | null;
    home_team: string | null; away_team: string | null; status: string;
  }>(
    `SELECT m.id, m.slot, m.round_id, cr.label, m.status,
            m.home_registration_id, m.away_registration_id,
            home_team.name AS home_team, away_team.name AS away_team
       FROM matches m
       JOIN competition_rounds cr ON cr.id = m.round_id
       LEFT JOIN registrations home_reg ON home_reg.id = m.home_registration_id
       LEFT JOIN teams home_team        ON home_team.id = home_reg.team_id
       LEFT JOIN registrations away_reg ON away_reg.id = m.away_registration_id
       LEFT JOIN teams away_team        ON away_team.id = away_reg.team_id
      WHERE cr.tournament_id = $1 AND cr.status = 'CURRENT'
      ORDER BY cr.round_number, m.slot`,
    [tournamentId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slot: row.slot,
    roundId: Number(row.round_id),
    roundLabel: row.label,
    homeRegistrationId: row.home_registration_id === null ? null : Number(row.home_registration_id),
    awayRegistrationId: row.away_registration_id === null ? null : Number(row.away_registration_id),
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    status: row.status,
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
