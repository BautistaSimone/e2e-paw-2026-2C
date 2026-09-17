/**
 * El tablero publico (`GET /`): la unica pantalla que ve alguien sin cuenta.
 *
 * Los filtros son un `<form method="get">`, asi que quedan en la URL y
 * sobreviven a paginar. Por eso los metodos de aca navegan de verdad en vez de
 * simular clicks: es lo mismo que hace el browser al submitear.
 */
import type { Locator, Page } from '@playwright/test';

export type TournamentStatus = 'REGISTRATION_OPEN' | 'IN_PROGRESS' | 'FINISHED';

export class DiscoverPage {
  constructor(protected readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Todas las tarjetas de torneo de la grilla. */
  get cards(): Locator {
    return this.page.locator('.rejilla .torneo');
  }

  /** La tarjeta de un torneo por su nombre. */
  card(name: string): Locator {
    return this.cards.filter({ has: this.page.locator('.torneo__title', { hasText: name }) });
  }

  get search(): Locator {
    return this.page.locator('#buscar');
  }

  get statusFilter(): Locator {
    return this.page.locator('#estado');
  }

  get modalityFilter(): Locator {
    return this.page.locator('#modalidad');
  }

  get formatFilter(): Locator {
    return this.page.locator('#formato');
  }

  get emptyState(): Locator {
    return this.page.locator('#torneos .vacio');
  }

  /** El boton del estado vacio: "limpiar filtros" o "volver a la primera". */
  get emptyStateAction(): Locator {
    return this.emptyState.locator('.btn');
  }

  /** El "limpiar" de la barra de filtros, que solo aparece si hay alguno puesto. */
  get clearFilters(): Locator {
    return this.page.locator('.filtros__acciones a.btn--linea');
  }

  get pagination(): Locator {
    return this.page.locator('.paginador');
  }

  get nextPage(): Locator {
    return this.pagination.locator('a.paginador__salto').last();
  }

  get previousPage(): Locator {
    return this.pagination.locator('a.paginador__salto').first();
  }

  /** Busca por nombre y espera la navegacion que dispara el form GET. */
  async searchFor(text: string): Promise<void> {
    await this.search.fill(text);
    await this.search.press('Enter');
    await this.page.waitForLoadState();
  }

  /** Aplica un filtro del `<select>`; cada uno submitea el form solo. */
  async filterBy(filter: 'estado' | 'modalidad' | 'formato', value: string): Promise<void> {
    await this.page.locator(`#${filter}`).selectOption(value);
    await this.page.locator('.filtros button[type="submit"]').click();
    await this.page.waitForLoadState();
  }

  /** Entra al detalle desde la tarjeta, como lo haria una persona. */
  async open(name: string): Promise<void> {
    await this.card(name).getByRole('link').first().click();
    await this.page.waitForLoadState();
  }
}
