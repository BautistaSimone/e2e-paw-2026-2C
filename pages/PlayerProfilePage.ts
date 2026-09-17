/**
 * `/jugadores/{id}`: el perfil publico de un jugador. Lo ve cualquiera, incluso
 * sin cuenta; el form para cambiar el nombre solo aparece en el perfil propio.
 *
 * Las ocho cifras de la carrera son `article.marcador` en un orden fijo que
 * define el JSP. Se indexan por ese orden y se les pone nombre aca, que es
 * mejor que pedirle al test que sepa que la quinta es "asistencias".
 */
import type { Locator, Page } from '@playwright/test';

import { Flash, clickWhenEnabled } from './common';

const CAREER_TILES = [
  'titles',
  'tournaments',
  'matches',
  'goals',
  'assists',
  'mvps',
  'yellowCards',
  'redCards',
] as const;

export type CareerStat = (typeof CAREER_TILES)[number];

export class PlayerProfilePage {
  readonly flash: Flash;

  constructor(private readonly page: Page) {
    this.flash = new Flash(page);
  }

  async goto(playerId: number, page = 1): Promise<void> {
    await this.page.goto(page === 1 ? `/jugadores/${playerId}` : `/jugadores/${playerId}?pagina=${page}`);
  }

  get name(): Locator {
    return this.page.locator('.perfil-hero h1');
  }

  /** El valor de una de las ocho cifras de la carrera. */
  stat(name: CareerStat): Locator {
    return this.page
      .locator('.marcadores--perfil .marcador')
      .nth(CAREER_TILES.indexOf(name))
      .locator('strong');
  }

  /** La tabla de torneos jugados. */
  get tournaments(): Locator {
    return this.page.locator('table.posiciones tbody tr');
  }

  /** Las filas destacadas: los torneos que gano. */
  get championRows(): Locator {
    return this.page.locator('table.posiciones tbody tr.posiciones__lider');
  }

  get pagination(): Locator {
    return this.page.locator('.paginador');
  }

  // ------------------------------------------------------- nombre (propio)

  /** El form existe solo en el perfil propio. */
  get nameForm(): Locator {
    return this.page.locator('form.perfil-nombre');
  }

  get displayName(): Locator {
    return this.page.locator('#displayName');
  }

  get saveNameButton(): Locator {
    return this.nameForm.locator('[data-dirty-submit]');
  }

  get nameError(): Locator {
    return this.nameForm.locator('.campo__error');
  }

  async setDisplayName(value: string): Promise<void> {
    await this.displayName.fill(value);
    await clickWhenEnabled(this.saveNameButton);
    await this.page.waitForLoadState();
  }
}
