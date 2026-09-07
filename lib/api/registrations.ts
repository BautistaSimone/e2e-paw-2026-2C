/**
 * Inscripciones de equipos, espejo de TournamentController#join/#leave y de la
 * resolucion de pendientes de TournamentManagementController.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit } from './client';
import { managementPath } from './tournaments';

export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'WITHDRAWN';

/** Anota un equipo. Dispara el mail al organizador y la invitacion al capitan. */
export async function joinTournament(
  request: APIRequestContext,
  tournamentId: number,
  teamName: string,
  captainEmail: string,
): Promise<void> {
  await submit(request, `/torneos/${tournamentId}/inscripciones`, { teamName, captainEmail });
}

export async function leaveTournament(
  request: APIRequestContext,
  tournamentId: number,
  email: string,
): Promise<void> {
  await submit(request, `/torneos/${tournamentId}/salir`, { email });
}

/** Acepta o rechaza una inscripcion pendiente desde el panel de gestion. */
export async function resolveRegistration(
  request: APIRequestContext,
  tournamentId: number,
  registrationId: number,
  status: RegistrationStatus,
): Promise<void> {
  await submit(
    request,
    `${managementPath(tournamentId)}/inscripciones/${registrationId}`,
    { status },
  );
}
