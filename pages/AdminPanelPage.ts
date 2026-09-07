/** Panel del organizador: listado y alta de torneos (`adminPanel.jsp`). */
import type { Locator, Page } from '@playwright/test';

import type { PlayersPerSide, TournamentFormat } from '../lib/api';

export interface TournamentFormValues {
  name: string;
  maxTeams?: number;
  format?: TournamentFormat;
  playersPerSide?: PlayersPerSide;
  /** ISO yyyy-MM-dd. */
  startsAt?: string;
  location?: string;
}

export class AdminPanelPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/adminPanel');
  }

  async openCreateDialog(): Promise<void> {
    // Dos botones abren este mismo dialogo: el de la cabecera y el CTA del
    // estado vacio ("crea el primero"), que solo aparece sin torneos cargados.
    // Se apunta al de la cabecera, que esta siempre, y por aria-controls, que
    // es lo que declara que dialogo abre (y lo que lee un lector de pantalla).
    await this.createButton.click();
    await this.createDialog.waitFor({ state: 'visible' });
  }

  /** El de la cabecera; el del estado vacio abre el mismo dialogo. */
  get createButton(): Locator {
    return this.page.locator('header [aria-controls="crear-torneo"]');
  }

  get createDialog(): Locator {
    return this.page.locator('#crear-torneo');
  }

  /** Crea un torneo llenando el modal, como lo hace el organizador. */
  async createTournament(values: TournamentFormValues): Promise<void> {
    await this.openCreateDialog();
    await this.page.locator('#nombre-torneo').fill(values.name);
    await this.page.locator('#equipos').fill(String(values.maxTeams ?? 4));
    await this.page.locator('#formato-torneo').selectOption(values.format ?? 'LEAGUE');
    await this.page.locator('#jugadores-por-lado').selectOption(values.playersPerSide ?? 'FIVE');
    await this.page.locator('#fecha-inicio').fill(values.startsAt ?? inDays(30));
    await this.page.locator('#cancha').fill(values.location ?? 'Cancha de prueba');
    await this.page.locator('#form-crear-torneo button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  get rows(): Locator {
    return this.page.locator('.torneo');
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  async search(text: string): Promise<void> {
    await this.page.locator('#buscar-admin').fill(text);
    await this.page.locator('#buscar-admin').press('Enter');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async manage(tournamentId: number): Promise<void> {
    await this.page.goto(`/adminPanel/torneos/${tournamentId}/gestion`);
  }
}

const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
