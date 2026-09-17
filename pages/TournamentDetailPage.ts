/**
 * `/torneos/{id}`: la pantalla publica del torneo.
 *
 * Seis tabs client-side (resumen, posiciones, fixture, cuadro, estadisticas y
 * reglamento) y, segun quien mire, el boton de anotarse, el de salir o un link
 * al login. Algunos tabs no existen para todos los formatos: posiciones no esta
 * en eliminacion directa y cuadro no esta en liga.
 */
import type { Locator, Page } from '@playwright/test';

import { Flash, Tabs, confirmDialog, fieldError } from './common';

export type DetailTab =
  | 'resumen'
  | 'posiciones'
  | 'fixture'
  | 'cuadro'
  | 'estadisticas'
  | 'reglamento';

export type Ranking = 'goles' | 'asistencias' | 'figuras' | 'amarillas' | 'rojas';

export class TournamentDetailPage {
  readonly flash: Flash;
  readonly tabs: Tabs;

  constructor(private readonly page: Page) {
    this.flash = new Flash(page);
    this.tabs = new Tabs(page);
  }

  async goto(id: number): Promise<void> {
    await this.page.goto(`/torneos/${id}`);
  }

  get title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** El badge de estado. Lleva el estado crudo en un data attribute. */
  get status(): Locator {
    return this.page.locator('[data-tournament-status]').first();
  }

  openTab(tab: DetailTab): Promise<Locator> {
    return this.tabs.open(tab);
  }

  /** El boton del tab, para afirmar que un tab no existe en este formato. */
  tabButton(tab: DetailTab): Locator {
    return this.page.locator(`#${tab}-tab`);
  }

  // ------------------------------------------------------------- anotarse

  get joinButton(): Locator {
    return this.page.locator('[data-dialog-open="anotar-equipo"]');
  }

  /** El texto que explica por que no se puede anotar: el cupo esta lleno. */
  get fullNotice(): Locator {
    return this.page.locator('#cupo-lleno');
  }

  /** Para el visitante anonimo, el link que lleva al login y despues vuelve. */
  get joinLink(): Locator {
    return this.page.locator('a[href*="/participar"]');
  }

  get joinDialog(): Locator {
    return this.page.locator('#anotar-equipo');
  }

  /**
   * Se anota con un equipo.
   *
   * El plantel se carga de a un mail por los chips, que es lo que ve una
   * persona: `app.js` **esconde el textarea** (`textarea.hidden = true`) y deja
   * el editor en su lugar. El textarea sigue siendo el campo que viaja — los
   * chips lo van escribiendo — pero llenarlo a mano seria escribir en un campo
   * invisible, algo que ningun usuario puede hacer.
   */
  async join(teamName: string, players: string[] = []): Promise<void> {
    if (!(await this.joinDialog.isVisible())) await this.joinButton.click();
    await this.page.locator('#nombre-equipo').fill(teamName);
    for (const player of players) await this.addPlayer(player);
    await this.page.locator('#form-anotar-equipo button[type="submit"]').click();
    await this.page.waitForLoadState();
  }

  /** Suma un mail al plantel. Enter es lo que confirma cada chip. */
  async addPlayer(email: string): Promise<void> {
    await this.page.locator('#jugador-email').fill(email);
    await this.page.locator('#jugador-email').press('Enter');
  }

  /** Los mails ya cargados como chips. */
  get rosterChips(): Locator {
    return this.joinDialog.locator('.roster__list li');
  }

  /** El contador `n / 15` que lleva el editor. */
  get rosterCount(): Locator {
    return this.page.locator('[data-roster-count]');
  }

  /** El error que pinta el editor sin ir al servidor (mail invalido, repetido). */
  get rosterError(): Locator {
    return this.page.locator('[data-roster-error]');
  }

  /** Lo que quedo cargado en el modal, para verificar que un rechazo no lo perdio. */
  get joinTeamName(): Locator {
    return this.page.locator('#nombre-equipo');
  }

  get joinPlayers(): Locator {
    return this.page.locator('#jugadores-equipo');
  }

  joinError(field: 'nombre-equipo' | 'jugadores'): Locator {
    return fieldError(this.page, field);
  }

  // ----------------------------------------------------------------- salir

  get leaveButton(): Locator {
    return this.page.locator('[data-dialog-open="salir-torneo"]');
  }

  /**
   * Salir pasa por dos pantallas: el modal `#salir-torneo`, y el dialogo de
   * confirmacion al que `app.js` desvia el submit (el form lleva
   * `data-confirm`). Al abrirse el segundo, el primero se cierra solo.
   */
  async leave(): Promise<void> {
    await this.leaveButton.click();
    await this.page.locator('#salir-torneo form button[type="submit"]').click();
    await confirmDialog(this.page);
    await this.page.waitForLoadState();
  }

  // ------------------------------------------------------------- contenido

  get standings(): Locator {
    return this.tabs.panel('posiciones').locator('table.posiciones');
  }

  /** Las filas de la tabla, de arriba hacia abajo: la primera es la punta. */
  get standingsRows(): Locator {
    return this.standings.first().locator('tbody tr');
  }

  /**
   * Cuantas tablas de posiciones hay. En liga es una sola; en fase de grupos,
   * una por zona.
   */
  get standingsTables(): Locator {
    return this.standings;
  }

  get bracket(): Locator {
    return this.tabs.panel('cuadro');
  }

  get fixture(): Locator {
    return this.tabs.panel('fixture');
  }

  /**
   * Una de las cinco tablas de estadisticas del torneo.
   *
   * El id que recibe `playerRankingTable.tag` queda en el **titulo**, no en el
   * bloque, asi que `#ranking-goles` es un `<h3>` con el rotulo y nada mas. Lo
   * que el test quiere es la tabla: el `.ranking` que contiene ese titulo.
   */
  ranking(kind: Ranking): Locator {
    return this.page.locator(`.ranking:has(#ranking-${kind})`);
  }

  /** Link a un torneo de gestion, visible solo para el dueño o un admin. */
  get manageLink(): Locator {
    return this.page.locator('a[href$="/gestion"]');
  }
}
