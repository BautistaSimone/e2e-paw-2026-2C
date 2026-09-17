/**
 * La planilla de un partido: goles con autor, tarjetas y figura.
 * Espejo de MatchSheetController.
 *
 * La app exige **una fila de gol por cada gol del marcador**, de cada lado. Una
 * fila sin autor es un gol que nadie se adjudica: suma en el marcador y no deja
 * evento. Por eso `goalsFor` acepta filas vacias.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit, submitExpectingRejection, type FormData } from './client';
import { managementPath } from './tournaments';

export type CardType = 'YELLOW_CARD' | 'RED_CARD';

/** Una fila de gol. Todo opcional: la fila vacia es el gol sin autor. */
export interface GoalRow {
  scorerId?: number;
  assistId?: number;
  minute?: number;
}

export interface CardRow {
  playerId: number;
  type?: CardType;
  minute?: number;
}

export interface Sheet {
  /** Tantas filas como goles del local, aunque algunas queden vacias. */
  homeGoals?: GoalRow[];
  awayGoals?: GoalRow[];
  cards?: CardRow[];
  /** La figura del partido. Una sola por partido. */
  mvpId?: number;
}

export const sheetPath = (tournamentId: number, matchId: number): string =>
  `${managementPath(tournamentId)}/partidos/${matchId}/estadisticas`;

function toSheetForm(sheet: Sheet): FormData {
  const form: FormData = {};
  const goals = (side: 'homeGoals' | 'awayGoals'): void => {
    (sheet[side] ?? []).forEach((goal, index) => {
      form[`${side}[${index}].scorerId`] = goal.scorerId;
      form[`${side}[${index}].assistId`] = goal.assistId;
      form[`${side}[${index}].minute`] = goal.minute;
    });
  };
  goals('homeGoals');
  goals('awayGoals');
  (sheet.cards ?? []).forEach((card, index) => {
    form[`cards[${index}].playerId`] = card.playerId;
    form[`cards[${index}].type`] = card.type ?? 'YELLOW_CARD';
    form[`cards[${index}].minute`] = card.minute;
  });
  form['mvpId'] = sheet.mvpId;
  return form;
}

export async function saveSheet(
  request: APIRequestContext,
  tournamentId: number,
  matchId: number,
  sheet: Sheet,
): Promise<void> {
  await submit(request, sheetPath(tournamentId, matchId), toSheetForm(sheet));
}

export async function saveSheetExpectingRejection(
  request: APIRequestContext,
  tournamentId: number,
  matchId: number,
  sheet: Sheet,
): Promise<string[]> {
  return submitExpectingRejection(request, sheetPath(tournamentId, matchId), toSheetForm(sheet));
}
