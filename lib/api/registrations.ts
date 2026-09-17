/**
 * Inscripciones de equipos, espejo de TournamentController#join/#leave y de la
 * resolucion de pendientes de TournamentManagementController.
 *
 * Cambio importante respecto del sprint 1: el capitan ya no viaja como
 * parametro. Es el usuario autenticado del contexto que hace el POST, asi que
 * "quien se anota" se elige eligiendo el contexto, no pasando un email.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit, submitExpectingRejection } from './client';
import { managementPath } from './tournaments';

export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'WITHDRAWN';

export interface JoinOptions {
  /**
   * Plantel opcional. La app lo parte por comas, puntos y coma o espacios, y
   * crea como PENDING a los mails que todavia no tienen cuenta.
   */
  players?: string[];
}

/** Anota al usuario del contexto como capitan. Dispara el mail al organizador. */
export async function joinTournament(
  request: APIRequestContext,
  tournamentId: number,
  teamName: string,
  { players = [] }: JoinOptions = {},
): Promise<void> {
  await submit(request, `/torneos/${tournamentId}/inscripciones`, {
    teamName,
    players: players.join(', '),
  });
}

/** La misma inscripcion, esperando que la app la rechace. Devuelve los errores. */
export async function joinExpectingRejection(
  request: APIRequestContext,
  tournamentId: number,
  teamName: string,
  { players = [] }: JoinOptions = {},
): Promise<string[]> {
  return submitExpectingRejection(request, `/torneos/${tournamentId}/inscripciones`, {
    teamName,
    players: players.join(', '),
  });
}

export async function leaveTournament(
  request: APIRequestContext,
  tournamentId: number,
): Promise<void> {
  await submit(request, `/torneos/${tournamentId}/salir`);
}

/** Acepta, rechaza o da de baja una inscripcion desde el panel de gestion. */
export async function resolveRegistration(
  request: APIRequestContext,
  tournamentId: number,
  registrationId: number,
  status: RegistrationStatus,
): Promise<string> {
  return submit(
    request,
    `${managementPath(tournamentId)}/inscripciones/${registrationId}`,
    { status },
  );
}

/**
 * El organizador suma un equipo que se anoto por afuera. Si el capitan no tiene
 * cuenta, la app se la crea como PENDING.
 */
export async function addTeam(
  request: APIRequestContext,
  tournamentId: number,
  teamName: string,
  captainEmail: string,
): Promise<void> {
  await submit(request, `${managementPath(tournamentId)}/equipos`, { teamName, captainEmail });
}
