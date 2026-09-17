/**
 * `/torneos/{id}/gestion`: la consola del organizador. La pantalla mas grande
 * de la app y la que mas trampas tiene para un test.
 *
 * Tres cosas que explican casi todos los selectores raros de aca:
 *
 * 1. **Ids duplicados.** La agenda y la planilla de resultados viven las dos
 *    dentro de `#partidos` y las dos emiten `matches0.matchId`, `matches0.date`
 *    y compañia. Por eso nada se busca por id suelto: todo se scopea a
 *    `form[action$="/agenda"]` o a `form.planilla`, y los campos se ubican por
 *    `name`, que ademas evita tener que escapar el punto del id en CSS.
 * 2. **Botones que arrancan apagados.** Guardar datos, guardar agenda (fecha
 *    entera y fila suelta) y guardar resultados son `data-dirty-submit`: se
 *    habilitan cuando un campo cambia de verdad. Poner el valor que ya estaba
 *    no alcanza.
 * 3. **El select de cancha se repuebla por fetch** cuando cambia el dia o la
 *    hora. Elegir cancha antes de que conteste elige sobre la lista vieja.
 */
import type { Locator, Page } from '@playwright/test';

import { Flash, Tabs, clickWhenEnabled, confirmDialog, confirmModal, fieldError } from './common';

export type ManagementTab = 'panel' | 'datos' | 'equipos' | 'partidos' | 'peligro';
export type RegistrationAction = 'ACTIVE' | 'REJECTED' | 'WITHDRAWN';

export interface ScheduleRow {
  date?: string;
  startsAt?: string;
  venue?: string;
}

export class TournamentManagementPage {
  readonly flash: Flash;
  readonly tabs: Tabs;

  constructor(private readonly page: Page) {
    this.flash = new Flash(page);
    this.tabs = new Tabs(page);
  }

  async goto(id: number, params: Record<string, string | number> = {}): Promise<void> {
    const query = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString();
    await this.page.goto(`/torneos/${id}/gestion${query ? `?${query}` : ''}`);
  }

  openTab(tab: ManagementTab): Promise<Locator> {
    return this.tabs.open(tab);
  }

  // ----------------------------------------------------------------- panel

  /** El estado del torneo, con el valor crudo en el data attribute. */
  get status(): Locator {
    return this.page.locator('.marcador--estado[data-tournament-status]');
  }

  get publishButton(): Locator {
    return this.page.locator('form[action$="/publicar"] button[type="submit"]');
  }

  get startButton(): Locator {
    return this.page.locator('[data-dialog-open="confirmar-inicio"]');
  }

  /** El texto que explica por que todavia no se puede iniciar. */
  get startHelp(): Locator {
    return this.page.locator('#inicio-ayuda');
  }

  async publish(): Promise<void> {
    await this.openTab('panel');
    await this.publishButton.click();
    await this.page.waitForLoadState();
  }

  async start(): Promise<void> {
    await this.openTab('panel');
    await this.startButton.click();
    await confirmModal(this.page, 'confirmar-inicio');
    await this.page.waitForLoadState();
  }

  // ----------------------------------------------------------------- datos

  private get dataForm(): Locator {
    return this.page.locator('form[action$="/datos"]');
  }

  dataField(name: 'name' | 'description' | 'rules' | 'startsAt' | 'location'): Locator {
    return this.dataForm.locator(`[name="${name}"]`);
  }

  get coverInput(): Locator {
    return this.page.locator('#portada-archivo');
  }

  get currentCover(): Locator {
    return this.page.locator('img.portada-actual');
  }

  get saveDataButton(): Locator {
    return this.dataForm.locator('[data-dirty-submit]');
  }

  /**
   * Guarda datos y portada en un solo submit, que es como lo hace la pantalla.
   * El boton solo se habilita si algun campo cambio de verdad.
   */
  async saveData(
    values: Partial<Record<'name' | 'description' | 'rules' | 'startsAt' | 'location', string>>,
    cover?: { name: string; mimeType: string; buffer: Buffer },
  ): Promise<void> {
    await this.openTab('datos');
    for (const [field, value] of Object.entries(values)) {
      await this.dataField(field as 'name').fill(value);
    }
    if (cover) await this.coverInput.setInputFiles(cover);
    await clickWhenEnabled(this.saveDataButton);
    await this.page.waitForLoadState();
  }

  // ---------------------------------------------------------------- equipos

  get teamCards(): Locator {
    return this.page.locator('.equipo-admin');
  }

  teamCard(name: string): Locator {
    return this.teamCards.filter({ hasText: name });
  }

  /** El plantel que muestra la tarjeta del equipo. */
  roster(teamName: string): Locator {
    return this.teamCard(teamName).locator('.equipo-admin__plantel .equipo-admin__jugador');
  }

  rosterEmptyNotice(teamName: string): Locator {
    return this.teamCard(teamName).locator('.equipo-admin__sin-plantel');
  }

  /** Los links a los perfiles de los jugadores del plantel. */
  rosterLinks(teamName: string): Locator {
    return this.roster(teamName).locator('a');
  }

  /**
   * Acepta, rechaza o da de baja una inscripcion. Cada accion es su propio
   * form y se distingue por el `status` que lleva escondido.
   */
  async resolveRegistration(teamName: string, action: RegistrationAction): Promise<void> {
    await this.openTab('equipos');
    const form = this.teamCard(teamName).locator(`form:has(input[value="${action}"])`);
    await form.locator('button[type="submit"]').click();
    // Dar de baja va por el dialogo compartido; aceptar y rechazar no.
    if (action === 'WITHDRAWN') await confirmDialog(this.page);
    await this.page.waitForLoadState();
  }

  /** El organizador suma un equipo que se anoto por afuera. */
  async addTeam(teamName: string, captainEmail: string): Promise<void> {
    await this.openTab('equipos');
    const form = this.page.locator('form[action$="/equipos"]');
    await form.locator('#teamName').fill(teamName);
    await form.locator('#captainEmail').fill(captainEmail);
    await form.locator('button[type="submit"]').click();
    await this.page.waitForLoadState();
  }

  teamError(field: 'teamName' | 'captainEmail'): Locator {
    return fieldError(this.page, field);
  }

  // --------------------------------------------------------------- partidos

  private get scheduleForm(): Locator {
    return this.page.locator('form[action$="/agenda"]');
  }

  private get resultsForm(): Locator {
    return this.page.locator('form.planilla');
  }

  /** Las filas de la agenda, en el orden en que las pinta la pantalla. */
  get scheduleRows(): Locator {
    return this.scheduleForm.locator('[data-schedule-row]');
  }

  /** Las filas de la planilla de resultados. */
  get resultRows(): Locator {
    return this.resultsForm.locator('.planilla__partido');
  }

  /** Abre la fecha `roundId` en el selector de fechas. */
  async openRound(tournamentId: number, roundId: number): Promise<void> {
    await this.goto(tournamentId, { tab: 'partidos', fecha: roundId });
    await this.openTab('partidos');
  }

  /**
   * Completa una fila de la agenda. Espera a que el select de canchas se
   * repueble despues de tocar dia y hora: sin eso se elige sobre la lista que
   * habia antes del fetch.
   */
  async fillScheduleRow(index: number, { date, startsAt, venue }: ScheduleRow): Promise<void> {
    const row = this.scheduleRows.nth(index);
    if (date) await row.locator(`[name="matches[${index}].date"]`).fill(date);
    if (startsAt) await row.locator(`[name="matches[${index}].startsAt"]`).fill(startsAt);
    if (venue) {
      if (date || startsAt) await this.waitForVenues();
      await row.locator('[data-venue-select]').selectOption(venue);
    }
  }

  /** Espera la respuesta de `/canchas-disponibles` que dispara `app.js`. */
  async waitForVenues(): Promise<void> {
    await this.page
      .waitForResponse((response) => response.url().includes('/canchas-disponibles'), {
        timeout: 5_000,
      })
      .catch(() => {
        // Sin dia y hora completos la pantalla no consulta: no es un error.
      });
  }

  /** Las canchas que quedaron ofrecidas en una fila. */
  venueOptions(index: number): Locator {
    return this.scheduleRows.nth(index).locator('[data-venue-select] option');
  }

  /** Guarda la fecha entera (el boton que va arriba de las filas). */
  async saveWholeRound(): Promise<void> {
    await clickWhenEnabled(this.scheduleForm.locator('[data-dirty-submit]').first());
    await this.page.waitForLoadState();
  }

  /** Guarda una sola fila (el boton que lleva el `matchId` adentro). */
  async saveScheduleRow(index: number): Promise<void> {
    await clickWhenEnabled(this.scheduleRows.nth(index).locator('[data-dirty-submit]'));
    await this.page.waitForLoadState();
  }

  scheduleError(index: number): Locator {
    return this.scheduleRows.nth(index).locator('.campo__error, .partido-admin__error');
  }

  async postponeMatch(index: number): Promise<void> {
    await this.scheduleForm
      .locator('.partido-admin')
      .nth(index)
      .locator('button[formaction*="postergar"]')
      .click();
    await this.page.waitForLoadState();
  }

  /** Carga el marcador de una fila de la planilla. */
  async fillResult(
    index: number,
    home: number,
    away: number,
    winnerRegistrationId?: number,
  ): Promise<void> {
    const row = this.resultRows.nth(index);
    await row.locator(`[name="matches[${index}].homeGoals"]`).fill(String(home));
    await row.locator(`[name="matches[${index}].awayGoals"]`).fill(String(away));
    if (winnerRegistrationId !== undefined) {
      await row
        .locator(`[name="matches[${index}].winnerRegistrationId"]`)
        .selectOption(String(winnerRegistrationId));
    }
  }

  async saveResults(): Promise<void> {
    await clickWhenEnabled(this.resultsForm.locator('[data-dirty-submit]'));
    await this.page.waitForLoadState();
  }

  resultError(index: number): Locator {
    return this.resultRows.nth(index).locator('.planilla__error');
  }

  /** Link a la planilla de estadisticas, que aparece recien con el partido jugado. */
  sheetLink(index: number): Locator {
    return this.resultRows.nth(index).locator('.planilla__estadisticas');
  }

  get advanceButton(): Locator {
    return this.page.locator('[data-dialog-open="confirmar-avance"]');
  }

  /** Por que no se puede avanzar todavia. */
  get advanceHelp(): Locator {
    return this.page.locator('#avance-pendiente');
  }

  async advance(): Promise<void> {
    await this.advanceButton.click();
    await confirmModal(this.page, 'confirmar-avance');
    await this.page.waitForLoadState();
  }

  get reopenButton(): Locator {
    return this.page.locator('form[action$="/reabrir"] button[type="submit"]');
  }

  async reopen(): Promise<void> {
    await this.reopenButton.click();
    await this.page.waitForLoadState();
  }

  // ---------------------------------------------------------------- peligro

  async cancel(reason: string): Promise<void> {
    await this.openTab('peligro');
    await this.page.locator('#reason').fill(reason);
    await this.page.locator('form[action$="/cancelar"] button[type="submit"]').click();
    await confirmDialog(this.page);
    await this.page.waitForLoadState();
  }

  get cancelError(): Locator {
    return fieldError(this.page, 'reason');
  }
}
