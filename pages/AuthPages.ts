/**
 * Login, registro y la cabecera. Van juntos porque son la misma conversacion:
 * entrar, salir y ver quien esta adentro.
 */
import type { Locator, Page } from '@playwright/test';

import { confirmModal } from './common';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  get email(): Locator {
    return this.page.locator('#login-email');
  }

  get password(): Locator {
    return this.page.locator('#login-password');
  }

  get rememberMe(): Locator {
    return this.page.locator('input[name="remember-me"]');
  }

  get submit(): Locator {
    return this.page.locator('.auth-form button[type="submit"]');
  }

  /** El cartel rojo de `?error` o de `?expired`. Son el mismo elemento. */
  get error(): Locator {
    return this.page.locator('.auth-error');
  }

  /** El titulo de la pantalla, que es lo que cambia al cambiar de idioma. */
  get title(): Locator {
    return this.page.locator('#login-title');
  }

  /** El ojo que muestra el password. Sale `hidden` hasta que corre el JS. */
  get passwordToggle(): Locator {
    return this.page.locator('[data-password-toggle="login-password"]');
  }

  async login(
    email: string,
    password: string,
    { rememberMe = false }: { rememberMe?: boolean } = {},
  ): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    if (rememberMe) await this.rememberMe.check();
    await this.submit.click();
  }
}

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/registro');
  }

  /** Spring genera `id="email"` / `id="password"` a partir del path del form. */
  get email(): Locator {
    return this.page.locator('#email');
  }

  get password(): Locator {
    return this.page.locator('#password');
  }

  get submit(): Locator {
    return this.page.locator('.auth-form button[type="submit"]');
  }

  /** Todos los errores del form: los globales y los de cada campo. */
  get errors(): Locator {
    return this.page.locator('.auth-form .campo__error');
  }

  async register(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /**
   * Saca el `type=email` del input para que el browser deje mandar el form.
   *
   * Es la unica forma de ejercitar la validacion del SERVIDOR: con el type
   * puesto, Chrome frena el submit y el request nunca sale, asi que lo que se
   * estaria probando es el browser y no la app.
   */
  async relaxEmailValidation(): Promise<void> {
    await this.email.evaluate((input) => input.setAttribute('type', 'text'));
  }
}

/** La cabecera, que es como se sabe si hay alguien logueado. */
export class SiteHeader {
  constructor(private readonly page: Page) {}

  get loginLink(): Locator {
    return this.page.locator('.cabecera__nav a[href$="/login"]');
  }

  get myTournamentsLink(): Locator {
    return this.page.locator('.cabecera__nav a[href$="/mis-torneos"]');
  }

  /** El link al perfil propio, que lleva el id del usuario autenticado. */
  get profileLink(): Locator {
    return this.page.locator('.cabecera__nav a[href*="/jugadores/"]');
  }

  get logoutButton(): Locator {
    return this.page.locator('.cabecera__nav button[aria-controls="confirmar-logout"]');
  }

  /** Logout real: el boton abre un modal, no postea directo. */
  async logout(): Promise<void> {
    await this.logoutButton.click();
    await confirmModal(this.page, 'confirmar-logout');
  }
}
