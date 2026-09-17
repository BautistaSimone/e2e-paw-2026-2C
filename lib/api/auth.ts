/**
 * Registro, login y logout. Espejo de AuthController y del formLogin de
 * WebAuthConfig.
 *
 * Dos cosas de la app que definen como se usa esto:
 *
 * - **Registrarse ya deja logueado.** `AuthController#register` autentica al
 *   toque (RegistrationAuthenticationService), asi que crear un usuario y
 *   loguearlo es una sola llamada y no dos.
 * - **`POST /registro` exige estar anonimo** (`.anonymous()` en WebAuthConfig),
 *   asi que se hace sobre un contexto recien creado, nunca sobre uno que ya
 *   tiene sesion.
 *
 * El token de CSRF se olvida despues de cada una de estas operaciones porque
 * Spring lo rota al cambiar de autenticacion.
 */
import type { APIRequestContext } from '@playwright/test';

import { TEST_EMAIL_DOMAIN, TEST_PASSWORD } from '../config';
import { forgetCsrfToken, locationOf, post, submit } from './client';

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Email unico por corrida. Sin esto, dos tests que registran "capitan@..." se
 * pisan: el segundo choca con el UNIQUE de `users.email`.
 */
let sequence = 0;
export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now().toString(36)}-${++sequence}@${TEST_EMAIL_DOMAIN}`;

/** Crea la cuenta y deja el contexto autenticado. */
export async function register(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<Credentials> {
  await submit(request, '/registro', { ...credentials });
  forgetCsrfToken(request);
  return credentials;
}

/** Atajo: inventa el email y usa el password de la suite. */
export const registerNew = (
  request: APIRequestContext,
  prefix: string,
): Promise<Credentials> =>
  register(request, { email: uniqueEmail(prefix), password: TEST_PASSWORD });

export async function login(
  request: APIRequestContext,
  credentials: Credentials,
  { rememberMe = false }: { rememberMe?: boolean } = {},
): Promise<void> {
  await submit(request, '/login', {
    ...credentials,
    'remember-me': rememberMe ? 'on' : undefined,
  });
  forgetCsrfToken(request);
}

/**
 * Login que se espera que falle. Devuelve el Location, que es `/login?error`
 * cuando las credenciales no sirven: sin esto, un login fallido se veria como
 * una excepcion y no se podria afirmar sobre el.
 */
export async function loginExpectingFailure(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<string> {
  const response = await post(request, '/login', { ...credentials });
  forgetCsrfToken(request);
  const location = locationOf(response);
  if (!location.includes('/login')) {
    throw new Error(
      `Esperaba que el login fallara y la app redirigio a "${location}" (HTTP ${response.status()}).`,
    );
  }
  return location;
}

export async function logout(request: APIRequestContext): Promise<void> {
  await submit(request, '/logout');
  forgetCsrfToken(request);
}
