/**
 * Operaciones sobre un torneo, espejo de AdminPanelController y de la parte de
 * datos de TournamentManagementController.
 *
 * Cada funcion recibe el `APIRequestContext` y nunca lo crea: el dia que haya
 * login se le pasa uno autenticado y ninguna firma cambia.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit } from './client';

export type TournamentFormat = 'LEAGUE' | 'SINGLE_ELIMINATION' | 'GROUP_STAGE';
export type PlayersPerSide = 'FIVE' | 'SEVEN' | 'ELEVEN';

export interface NewTournament {
  name: string;
  format?: TournamentFormat;
  maxTeams?: number;
  playersPerSide?: PlayersPerSide;
  /** ISO yyyy-MM-dd. Por defecto, dentro de un mes: el form exige futuro. */
  startsAt?: string;
  location?: string;
}

const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export async function createTournament(
  request: APIRequestContext,
  tournament: NewTournament,
): Promise<void> {
  await submit(request, '/adminPanel/torneos', {
    name: tournament.name,
    format: tournament.format ?? 'LEAGUE',
    maxTeams: tournament.maxTeams ?? 8,
    playersPerSide: tournament.playersPerSide ?? 'FIVE',
    startsAt: tournament.startsAt ?? inDays(30),
    location: tournament.location ?? 'Cancha de prueba',
  });
}

export const managementPath = (id: number): string => `/adminPanel/torneos/${id}/gestion`;

export async function publish(request: APIRequestContext, id: number): Promise<void> {
  await submit(request, `${managementPath(id)}/publicar`);
}

export async function cancel(
  request: APIRequestContext,
  id: number,
  reason: string,
): Promise<void> {
  await submit(request, `${managementPath(id)}/cancelar`, { reason });
}
