/**
 * Panel de gestion de un torneo (`tournamentManagement.jsp`): publicar,
 * resolver inscripciones, cargar la planilla y avanzar de fecha.
 */
import type { Locator, Page } from '@playwright/test';

export type ManagementTab = 'panel' | 'datos' | 'equipos' | 'partidos' | 'peligro';

export class TournamentManagementPage {
  constructor(private readonly page: Page) {}

  async goto(tournamentId: number, tab: ManagementTab = 'panel'): Promise<void> {
    await this.page.goto(`/adminPanel/torneos/${tournamentId}/gestion`);
    if (tab !== 'panel') await this.openTab(tab);
  }

  async openTab(tab: ManagementTab): Promise<void> {
    await this.page.locator(`#${tab}-tab`).click();
    await this.panel(tab).waitFor({ state: 'visible' });
  }

  panel(tab: ManagementTab): Locator {
    return this.page.locator(`#${tab}`);
  }

  async publish(): Promise<void> {
    await this.page.locator('form[action$="/publicar"] button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Arrancar el torneo pasa por un modal de confirmacion. */
  async start(): Promise<void> {
    await this.confirm('confirmar-inicio');
  }

  /** Avanzar de fecha tambien: es una accion terminal. */
  async advance(): Promise<void> {
    await this.openTab('partidos');
    await this.confirm('confirmar-avance');
  }

  private async confirm(dialogId: string): Promise<void> {
    await this.page.locator(`[data-dialog-open="${dialogId}"]`).click();
    const dialog = this.page.locator(`#${dialogId}`);
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Fila de un equipo en el tab de inscripciones. */
  teamRow(teamName: string): Locator {
    return this.panel('equipos').locator('.equipo-admin').filter({ hasText: teamName });
  }

  /** Acepta una inscripcion pendiente por el nombre del equipo. */
  async acceptTeam(teamName: string): Promise<void> {
    await this.openTab('equipos');
    await this.teamRow(teamName).locator('form:has(input[value="ACTIVE"]) button').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Carga la planilla de la fecha en juego. Los inputs de Spring viajan como
   * `matches[N].homeGoals`, en el mismo orden en que la pantalla lista los
   * partidos.
   */
  async fillRoundResults(scores: { home: number; away: number }[]): Promise<void> {
    await this.openTab('partidos');
    for (const [index, score] of scores.entries()) {
      await this.page.locator(`[name="matches[${index}].homeGoals"]`).fill(String(score.home));
      await this.page.locator(`[name="matches[${index}].awayGoals"]`).fill(String(score.away));
    }
  }

  /** Elige quien paso en un partido de eliminacion que quedo empatado. */
  async pickWinner(index: number, registrationId: number): Promise<void> {
    await this.page
      .locator(`[name="matches[${index}].winnerRegistrationId"]`)
      .selectOption(String(registrationId));
  }

  async saveResults(): Promise<void> {
    await this.page.locator('form.planilla button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Filas de la planilla de la fecha en juego. */
  get resultRows(): Locator {
    return this.page.locator('form.planilla [name$=".matchId"]');
  }

  /** Errores que la app devuelve pegados a una fila de la planilla. */
  get resultErrors(): Locator {
    return this.page.locator('form.planilla .campo__error');
  }

  /** Aviso de error que la app deja arriba del panel al volver de un redirect. */
  get flashError(): Locator {
    return this.page.locator('.flash--error');
  }
}
