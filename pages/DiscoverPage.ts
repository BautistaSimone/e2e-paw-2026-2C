/**
 * Home publica: buscador y grilla de torneos (`discover.jsp`).
 *
 * Los page objects son el UNICO lugar de la suite con selectores. Si cambia un
 * id o un texto de messages.properties, se toca un archivo y no veinte tests.
 */
import type { Locator, Page } from '@playwright/test';

export class DiscoverPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Tarjetas de torneo visibles, en el orden en que las pinta la pagina. */
  get cards(): Locator {
    return this.page.locator('.torneo');
  }

  card(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  async titles(): Promise<string[]> {
    return this.page.locator('.torneo__title').allInnerTexts();
  }

  /** Busca por nombre con el form GET de la pagina, como una persona. */
  async search(text: string): Promise<void> {
    await this.page.locator('#buscar').fill(text);
    await this.page.locator('#buscar').press('Enter');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Filtra por estado con los botones del form (Todos / Inscripciones / En juego). */
  async filterByStatus(status: '' | 'REGISTRATION_OPEN' | 'IN_PROGRESS'): Promise<void> {
    await this.page.locator(`button[name="estado"][value="${status}"]`).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async open(name: string): Promise<void> {
    await this.card(name).getByRole('link').click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
