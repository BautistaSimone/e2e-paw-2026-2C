/** Detalle publico de un torneo (`tournamentDetail.jsp`). */
import type { Locator, Page } from '@playwright/test';

export type DetailTab = 'resumen' | 'posiciones' | 'fixture' | 'cuadro' | 'reglamento';

export class TournamentDetailPage {
  constructor(private readonly page: Page) {}

  async goto(tournamentId: number): Promise<void> {
    await this.page.goto(`/torneos/${tournamentId}`);
  }

  /**
   * Anota un equipo desde el modal, como lo hace una persona: abre el dialogo,
   * completa los dos campos y envia.
   */
  async joinTeam(teamName: string, captainEmail: string): Promise<void> {
    await this.openJoinDialog();
    await this.page.locator('#nombre-equipo').fill(teamName);
    await this.page.locator('#email-capitan').fill(captainEmail);
    await this.page.locator('#form-anotar-equipo button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openJoinDialog(): Promise<void> {
    await this.page.locator('[data-dialog-open="anotar-equipo"]').click();
    await this.joinDialog.waitFor({ state: 'visible' });
  }

  get joinDialog(): Locator {
    return this.page.locator('#anotar-equipo');
  }

  /** Error de validacion pegado a un campo, como lo pinta el .tag formInput. */
  fieldError(fieldId: 'nombre-equipo' | 'email-capitan'): Locator {
    return this.page.locator(`#${fieldId}-error`);
  }

  /** Lo que quedo escrito en un campo: sirve para verificar que no se perdio. */
  fieldValue(fieldId: 'nombre-equipo' | 'email-capitan'): Locator {
    return this.page.locator(`#${fieldId}`);
  }

  async openTab(tab: DetailTab): Promise<void> {
    await this.page.locator(`#${tab}-tab`).click();
  }

  panel(tab: DetailTab): Locator {
    return this.page.locator(`#${tab}`);
  }

  /** Filas de la tabla de posiciones, en orden. */
  get standingsRows(): Locator {
    return this.page.locator('#posiciones tbody tr');
  }

  get fixtureMatches(): Locator {
    return this.page.locator('#fixture .partido');
  }
}
