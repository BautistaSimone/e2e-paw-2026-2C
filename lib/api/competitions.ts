/**
 * El torneo en juego: arrancarlo, agendar, cargar la planilla de una fecha,
 * avanzar. Espejo de la parte de competencia de
 * TournamentManagementController.
 */
import type { APIRequestContext } from '@playwright/test';

import { locationOf, post, submit, type FormData } from './client';
import { managementPath } from './tournaments';

/** Resultado de un partido, tal como lo manda la planilla de la fecha. */
export interface MatchResult {
  matchId: number;
  homeGoals: number;
  awayGoals: number;
  /**
   * Solo en eliminacion y solo si empataron: sin esto la app rechaza la fecha
   * pidiendo quien paso.
   */
  winnerRegistrationId?: number;
}

/** Una fila de la agenda. Todo opcional: una fecha puede quedar a confirmar. */
export interface MatchSchedule {
  matchId: number;
  /** ISO yyyy-MM-dd. */
  date?: string;
  /** ISO HH:mm. */
  startsAt?: string;
  /** La app solo acepta "1", "2" o "3". */
  venue?: string;
}

export async function startTournament(request: APIRequestContext, id: number): Promise<string> {
  return submit(request, `${managementPath(id)}/iniciar`);
}

/**
 * Arranca el torneo esperando que la app lo rechace, y devuelve el Location
 * con el `?resultado=` que explica por que (PENDING_REGISTRATIONS,
 * NOT_ENOUGH_TEAMS). No es un 200: el controller redirige igual.
 */
export async function startExpectingRejection(
  request: APIRequestContext,
  id: number,
): Promise<string> {
  return locationOf(await post(request, `${managementPath(id)}/iniciar`));
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

/**
 * Agenda dia, hora y cancha. Sin `onlyMatchId` guarda la fecha entera; con el,
 * solo esa fila, que es lo que hace el boton de cada partido.
 */
export async function saveSchedule(
  request: APIRequestContext,
  id: number,
  roundId: number,
  schedules: MatchSchedule[],
  onlyMatchId?: number,
): Promise<string> {
  const form: FormData = { roundId };
  schedules.forEach((schedule, index) => {
    form[`matches[${index}].matchId`] = schedule.matchId;
    form[`matches[${index}].date`] = schedule.date;
    form[`matches[${index}].startsAt`] = schedule.startsAt;
    form[`matches[${index}].venue`] = schedule.venue;
  });
  if (onlyMatchId !== undefined) form['matchId'] = onlyMatchId;
  return submit(request, `${managementPath(id)}/agenda`, form);
}

/** Canchas libres para ese dia y hora. La pantalla la consulta por fetch. */
export async function availableVenues(
  request: APIRequestContext,
  id: number,
  { date, startsAt, matchId }: { date: string; startsAt: string; matchId: number },
): Promise<string[]> {
  const response = await request.get(`${managementPath(id)}/canchas-disponibles`, {
    params: { date, startsAt, matchId },
  });
  const body = (await response.text()).trim();
  return body === '' ? [] : body.split(',');
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
