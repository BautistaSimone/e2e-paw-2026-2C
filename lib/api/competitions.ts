/**
 * El torneo en juego: arrancarlo, cargar la planilla de una fecha, avanzar.
 * Espejo de la parte de competencia de TournamentManagementController.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit, type FormData } from './client';
import { managementPath } from './tournaments';

/** Resultado de un partido, tal como lo manda la planilla de la fecha. */
export interface MatchResult {
  matchId: number;
  homeGoals: number;
  awayGoals: number;
  /**
   * Solo en eliminacion y solo si empataron: sin esto la app rechaza la fecha
   * pidiendo quien paso (es el caso que arreglo el commit 43e8f27).
   */
  winnerRegistrationId?: number;
}

export async function startTournament(request: APIRequestContext, id: number): Promise<void> {
  await submit(request, `${managementPath(id)}/iniciar`);
}

/**
 * Guarda la fecha entera. El form viaja indexado (`matches[0].homeGoals`),
 * igual que lo serializa la planilla del JSP.
 */
export async function saveResults(
  request: APIRequestContext,
  id: number,
  results: MatchResult[],
): Promise<void> {
  const form: FormData = {};
  results.forEach((result, index) => {
    form[`matches[${index}].matchId`] = result.matchId;
    form[`matches[${index}].homeGoals`] = result.homeGoals;
    form[`matches[${index}].awayGoals`] = result.awayGoals;
    if (result.winnerRegistrationId !== undefined) {
      form[`matches[${index}].winnerRegistrationId`] = result.winnerRegistrationId;
    }
  });
  await submit(request, `${managementPath(id)}/resultados`, form);
}

export async function advance(request: APIRequestContext, id: number): Promise<void> {
  await submit(request, `${managementPath(id)}/avanzar`);
}

export async function reopenPreviousRound(request: APIRequestContext, id: number): Promise<void> {
  await submit(request, `${managementPath(id)}/reabrir`);
}

export async function postponeMatch(
  request: APIRequestContext,
  id: number,
  matchId: number,
): Promise<void> {
  await submit(request, `${managementPath(id)}/partidos/${matchId}/postergar`);
}
