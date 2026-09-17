/**
 * Piezas que se repiten en varias pantallas.
 *
 * Todo lo de `pages/` es el unico lugar de la suite donde puede haber
 * selectores (regla 3 de `npm run check:rules`). Este archivo concentra las
 * tres trampas del front que, si cada page object las resolviera por su cuenta,
 * se resolverian distinto en cada uno:
 *
 * 1. El flash: `?resultado=` se borra de la URL apenas renderiza
 *    (`data-transient-result` + `history.replaceState` en `app.js`), asi que
 *    **nunca** se afirma sobre el query string, siempre sobre el cartel.
 * 2. Los tabs son client-side: `?tab=` solo elige el panel inicialmente
 *    visible, hay que clickear el boton.
 * 3. Los botones `data-dirty-submit` arrancan `disabled` y se habilitan recien
 *    cuando un campo cambia de verdad.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Cartel de resultado (verde) y de error (rojo). */
export class Flash {
  constructor(private readonly page: Page) {}

  get ok(): Locator {
    return this.page.locator('.flash:not(.flash--error)');
  }

  get error(): Locator {
    return this.page.locator('.flash--error');
  }
}

/**
 * Los tabs de detalle y gestion. `app.js` esconde los paneles que no estan
 * activos con `hidden`, asi que basta clickear el boton y esperar que el panel
 * se vea.
 */
export class Tabs {
  constructor(private readonly page: Page) {}

  async open(name: string): Promise<Locator> {
    await this.page.locator(`#${name}-tab`).click();
    const panel = this.page.locator(`#${name}`);
    await expect(panel).toBeVisible();
    return panel;
  }

  panel(name: string): Locator {
    return this.page.locator(`#${name}`);
  }
}

/**
 * El dialogo por donde pasan los forms con `data-confirm` (salir del torneo,
 * dar de baja un equipo, cancelar). Clickear el submit del form no alcanza:
 * `app.js` intercepta, cierra el modal que lo contenga y pide confirmar aca.
 *
 * Se busca por el atributo y no por id a proposito: `app.js` toma el primero
 * que encuentre con `[data-form-confirm-dialog='true']`, y ese id cambia segun
 * la pantalla (`#confirmar-salida` en el detalle, `#confirmar-formulario` en la
 * gestion). Buscarlo igual que la app es lo que hace que no haya que acordarse
 * de cual es cual.
 */
export async function confirmDialog(page: Page): Promise<void> {
  const dialog = page.locator("[data-form-confirm-dialog='true']");
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-form-confirm-submit]').click();
}

/** Los modales de confirmacion propios (`#confirmar-inicio`, `#confirmar-avance`). */
export async function confirmModal(page: Page, id: string): Promise<void> {
  const dialog = page.locator(`#${id}`);
  await expect(dialog).toBeVisible();
  await dialog.locator('button[type="submit"]').click();
}

/**
 * Espera a que un boton `data-dirty-submit` se habilite y lo clickea.
 *
 * Si se queda esperando, el motivo casi siempre es el mismo: se "cambio" un
 * campo poniendole el valor que ya tenia, y `app.js` compara contra el valor
 * inicial, asi que el form nunca se ensucio.
 */
export async function clickWhenEnabled(button: Locator): Promise<void> {
  await expect(button).toBeEnabled();
  await button.click();
}

/** El error que el `.tag` formInput pinta debajo de un campo. */
export const fieldError = (page: Page, id: string): Locator => page.locator(`#${id}-error`);
