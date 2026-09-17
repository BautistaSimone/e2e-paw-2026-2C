/**
 * `/torneos/{id}/gestion/partidos/{matchId}/estadisticas`: la planilla de un
 * partido.
 *
 * La pantalla ya trae **una fila de gol por cada gol del marcador** (las pinta
 * el controller a partir del resultado), asi que los tests completan filas que
 * ya existen en vez de agregarlas. Las tarjetas si se agregan de a una,
 * clonando un `<template>`.
 *
 * Los campos se buscan por `name` y no por id: Spring genera ids con punto
 * (`homeGoals0.scorerId`) que en CSS habria que escapar.
 */
import type { Locator, Page } from '@playwright/test';

import { Flash } from './common';

export type Side = 'homeGoals' | 'awayGoals';
export type CardType = 'YELLOW_CARD' | 'RED_CARD';

export class MatchSheetPage {
  readonly flash: Flash;

  constructor(private readonly page: Page) {
    this.flash = new Flash(page);
  }

  async goto(tournamentId: number, matchId: number): Promise<void> {
    await this.page.goto(`/torneos/${tournamentId}/gestion/partidos/${matchId}/estadisticas`);
  }

  private field(side: Side, index: number, field: 'scorerId' | 'assistId' | 'minute'): Locator {
    return this.page.locator(`[name="${side}[${index}].${field}"]`);
  }

  /** Carga un gol. `scorerId` vacio deja el gol sin autor, que la app acepta. */
  async fillGoal(
    side: Side,
    index: number,
    { scorerId, assistId, minute }: { scorerId?: number; assistId?: number; minute?: number },
  ): Promise<void> {
    if (scorerId !== undefined) {
      await this.field(side, index, 'scorerId').selectOption(String(scorerId));
    }
    if (assistId !== undefined) {
      await this.field(side, index, 'assistId').selectOption(String(assistId));
    }
    if (minute !== undefined) {
      await this.field(side, index, 'minute').fill(String(minute));
    }
  }

  /** Suma una fila de tarjeta clonando el template, y la completa. */
  async addCard(
    index: number,
    { playerId, type = 'YELLOW_CARD', minute }: { playerId: number; type?: CardType; minute?: number },
  ): Promise<void> {
    await this.page.locator('[data-sheet-add]').click();
    await this.page.locator(`#tarjeta-${index}-jugador`).selectOption(String(playerId));
    await this.page.locator(`#tarjeta-${index}-tipo`).selectOption(type);
    if (minute !== undefined) {
      await this.page.locator(`#tarjeta-${index}-minuto`).fill(String(minute));
    }
  }

  get mvp(): Locator {
    return this.page.locator('#mvpId');
  }

  async setMvp(playerId: number): Promise<void> {
    await this.mvp.selectOption(String(playerId));
  }

  get saveButton(): Locator {
    return this.page.locator('form button[type="submit"]').last();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForLoadState();
  }

  /** Todos los errores de validacion que quedaron pintados en la planilla. */
  get errors(): Locator {
    return this.page.locator('.campo__error');
  }

  /** Las filas de gol de un lado, para afirmar cuantas pide la pantalla. */
  goalRows(side: Side): Locator {
    return this.page.locator(`[name^="${side}["][name$="].scorerId"]`);
  }
}
