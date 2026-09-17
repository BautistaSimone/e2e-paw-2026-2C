/**
 * `/mis-torneos`: lo que organizo y lo que juego.
 *
 * Ojo con la diferencia respecto del detalle y la gestion: aca los tabs **no**
 * son client-side, son links que recargan la pagina con `?tab=`. Por eso
 * `openTab` navega en vez de clickear un boton.
 */
import type { Locator, Page } from '@playwright/test';

import { Flash, clickWhenEnabled, fieldError } from './common';

export type MyTournamentsTab = 'ORGANIZED' | 'ENROLLED';

export interface NewTournamentForm {
  name: string;
  maxTeams?: number;
  format?: 'LEAGUE' | 'SINGLE_ELIMINATION' | 'GROUP_STAGE';
  playersPerSide?: 'FIVE' | 'SEVEN' | 'ELEVEN';
  startsAt?: string;
  location?: string;
  /** La cancha con la que nacen los partidos. Solo 1, 2 o 3; por defecto la 1. */
  defaultVenue?: string;
}

export class MyTournamentsPage {
  readonly flash: Flash;

  constructor(private readonly page: Page) {
    this.flash = new Flash(page);
  }

  async goto(tab?: MyTournamentsTab): Promise<void> {
    await this.page.goto(tab ? `/mis-torneos?tab=${tab}` : '/mis-torneos');
  }

  get cards(): Locator {
    return this.page.locator('.descubrir--my-tournaments .rejilla .torneo');
  }

  card(name: string): Locator {
    return this.cards.filter({ has: this.page.locator('.torneo__title', { hasText: name }) });
  }

  /** El tab que la pantalla marca como actual. */
  get activeTab(): Locator {
    return this.page.locator('nav.tabs--my-tournaments a[aria-current="page"]');
  }

  get search(): Locator {
    return this.page.locator('#buscar-mios');
  }

  get statusFilter(): Locator {
    return this.page.locator('#estado');
  }

  get emptyState(): Locator {
    return this.page.locator('.descubrir--my-tournaments .vacio');
  }

  async openTab(tab: MyTournamentsTab): Promise<void> {
    await this.page.locator(`nav.tabs--my-tournaments a[href*="tab=${tab}"]`).click();
    await this.page.waitForLoadState();
  }

  async searchFor(text: string): Promise<void> {
    await this.search.fill(text);
    await this.search.press('Enter');
    await this.page.waitForLoadState();
  }

  // ---------------------------------------------------------------- crear

  get createButton(): Locator {
    return this.page.locator('[aria-controls="crear-torneo"]').first();
  }

  get createDialog(): Locator {
    return this.page.locator('#crear-torneo');
  }

  async openCreateDialog(): Promise<void> {
    await this.createButton.click();
  }

  /** Completa el modal de alta. Deja el submit sin apretar. */
  async fillCreateForm(form: NewTournamentForm): Promise<void> {
    const dialog = this.createDialog;
    await dialog.locator('#nombre-torneo').fill(form.name);
    if (form.maxTeams !== undefined) {
      await dialog.locator('#equipos').fill(String(form.maxTeams));
    }
    if (form.format) await dialog.locator('#formato-torneo').selectOption(form.format);
    if (form.playersPerSide) {
      await dialog.locator('#jugadores-por-lado').selectOption(form.playersPerSide);
    }
    if (form.startsAt) await dialog.locator('#fecha-inicio').fill(form.startsAt);
    if (form.location !== undefined) await dialog.locator('#cancha').fill(form.location);
    // Es obligatoria, asi que se elige una salvo que el test pida otra: un test
    // sobre otra cosa no tiene por que acordarse de este campo.
    await dialog.locator('#cancha-por-defecto').selectOption(form.defaultVenue ?? '1');
  }

  async submitCreateForm(): Promise<void> {
    await clickWhenEnabled(this.createDialog.locator('#form-crear-torneo button[type="submit"]'));
  }

  /** Alta completa: abrir, completar y mandar. */
  async createTournament(form: NewTournamentForm): Promise<void> {
    await this.openCreateDialog();
    await this.fillCreateForm(form);
    await this.submitCreateForm();
    await this.page.waitForLoadState();
  }

  /** El error debajo de un campo del modal (`#nombre-torneo-error`, etc.). */
  error(field: string): Locator {
    return fieldError(this.page, field);
  }

  /** Lo que quedo cargado en un campo, para verificar que no se perdio. */
  value(field: string): Locator {
    return this.createDialog.locator(`#${field}`);
  }

  /**
   * Saca el tope del date picker para poder mandar una fecha que el servidor
   * tiene que rechazar. Con el `max` puesto, Chrome frena el submit y el
   * request nunca sale: se estaria probando el browser, no la app.
   */
  async relaxStartDateLimit(): Promise<void> {
    await this.createDialog
      .locator('#fecha-inicio')
      .evaluate((input) => input.removeAttribute('max'));
  }
}
