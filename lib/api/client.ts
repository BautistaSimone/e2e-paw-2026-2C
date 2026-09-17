/**
 * Cliente HTTP contra la app, tal como la usa un browser: forms
 * `application/x-www-form-urlencoded`, sin JSON ni endpoints especiales.
 *
 * Dos cosas que este modulo resuelve y que ningun otro archivo tiene que saber:
 *
 * 1. **CSRF.** Spring Security lo tiene activo, asi que todo POST necesita el
 *    token de la sesion. Se lee de cualquier pantalla con un form (el input
 *    hidden que emiten los JSP) y se cachea por contexto. Spring **rota el
 *    token al autenticar**, o sea que el primero que se manda despues de un
 *    login esta vencido: ante un 403 se refresca y se reintenta una vez.
 *
 * 2. **Que significa cada respuesta.** Los controllers contestan un redirect
 *    (302) cuando la operacion salio y vuelven a pintar la pantalla (200)
 *    cuando el form fue rechazado. Por eso se corta el seguimiento de
 *    redirects. Ojo con el caso facil de confundir: un redirect a `/login`
 *    tambien es un 302, pero significa "no estabas logueado" — tratarlo como
 *    exito hace que el test falle tres pasos despues con un mensaje que no
 *    dice nada.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

export type FormValue = string | number | boolean | null | undefined;
export type FormData = Record<string, FormValue>;

/** Un archivo subido por un form multipart (la portada del torneo). */
export interface UploadedFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
export type MultipartData = Record<string, string | number | boolean | UploadedFile>;

/** Nombre del parametro de CSRF. Es el default de Spring Security. */
const CSRF_FIELD = '_csrf';

/** Pantalla publica que siempre trae un form con token, logueado o no. */
const CSRF_SOURCE = '/login';

/** Un token por contexto: cada contexto es una sesion distinta. */
const tokens = new WeakMap<APIRequestContext, string>();

/** Descarta los campos vacios: un form del browser tampoco los manda. */
export function toForm(data: FormData): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

/** El input hidden que emiten los JSP, en cualquiera de los dos ordenes. */
function scrapeToken(html: string): string | undefined {
  const nameFirst = new RegExp(`name="${CSRF_FIELD}"[^>]*?value="([^"]*)"`).exec(html);
  if (nameFirst) return nameFirst[1];
  const valueFirst = new RegExp(`value="([^"]*)"[^>]*?name="${CSRF_FIELD}"`).exec(html);
  return valueFirst?.[1];
}

/**
 * Token de CSRF de la sesion de este contexto. `refresh` fuerza releerlo, que
 * es lo que hace falta despues de autenticarse.
 */
export async function csrfToken(
  request: APIRequestContext,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<string> {
  const cached = tokens.get(request);
  if (cached && !refresh) return cached;

  const response = await request.get(CSRF_SOURCE);
  const token = scrapeToken(await response.text());
  if (!token) {
    throw new Error(
      `No encontre el token de CSRF en ${CSRF_SOURCE} (HTTP ${response.status()}).\n` +
        `Cambio el form de login, o se apago el CSRF en WebAuthConfig?`,
    );
  }
  tokens.set(request, token);
  return token;
}

/** Se llama al autenticarse o desloguearse: Spring rota el token ahi. */
export function forgetCsrfToken(request: APIRequestContext): void {
  tokens.delete(request);
}

/**
 * POST con el token puesto. Ante un 403 refresca el token y reintenta una vez,
 * porque el 403 de un token vencido es indistinguible del de permisos hasta
 * que se prueba con uno fresco.
 */
export async function post(
  request: APIRequestContext,
  path: string,
  data: FormData = {},
): Promise<APIResponse> {
  const send = async (token: string): Promise<APIResponse> =>
    request.post(path, {
      form: { ...toForm(data), [CSRF_FIELD]: token },
      maxRedirects: 0,
    });

  const response = await send(await csrfToken(request));
  if (response.status() !== 403) return response;
  return send(await csrfToken(request, { refresh: true }));
}

/** Igual que `post`, para los forms que viajan como multipart (la portada). */
export async function postMultipart(
  request: APIRequestContext,
  path: string,
  data: MultipartData = {},
): Promise<APIResponse> {
  const send = async (token: string): Promise<APIResponse> =>
    request.post(path, {
      multipart: { ...data, [CSRF_FIELD]: token },
      maxRedirects: 0,
    });

  const response = await send(await csrfToken(request));
  if (response.status() !== 403) return response;
  return send(await csrfToken(request, { refresh: true }));
}

/**
 * Los mensajes de error que quedaron pintados en la pantalla.
 *
 * La clase se busca como palabra suelta dentro del atributo y no como valor
 * exacto: la app combina `campo__error` con una clase de contexto segun donde
 * caiga el error (`campo__error planilla__error`,
 * `campo__error partido-admin__error`), y pedir el valor exacto los dejaba
 * pasar de largo — el form se veia como si no hubiera fallado.
 */
function messagesWithClass(html: string, className: string): string[] {
  const matches = html.matchAll(
    new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^<]+)<`, 'g'),
  );
  return [...matches].map((match) => match[1]!.trim()).filter(Boolean);
}

/** Errores que el `.tag` formInput pinta debajo de cada campo. */
const fieldErrors = (html: string): string[] => messagesWithClass(html, 'campo__error');

/** Errores globales del form (los que Spring pinta con `form:errors path="*"`). */
const globalErrors = (html: string): string[] => messagesWithClass(html, 'form__error');

const isRedirect = (status: number): boolean => status >= 300 && status < 400;

/** A donde redirigio. Vacio si no redirigio. */
export const locationOf = (response: APIResponse): string => response.headers()['location'] ?? '';

/**
 * Hace el POST y exige que la app haya redirigido a algun lado que no sea el
 * login, o sea que la operacion se concreto. Devuelve el Location.
 */
export async function submit(
  request: APIRequestContext,
  path: string,
  data: FormData = {},
): Promise<string> {
  return check(path, await post(request, path, data));
}

export async function submitMultipart(
  request: APIRequestContext,
  path: string,
  data: MultipartData = {},
): Promise<string> {
  return check(path, await postMultipart(request, path, data));
}

async function check(path: string, response: APIResponse): Promise<string> {
  const status = response.status();

  if (isRedirect(status)) {
    const location = locationOf(response);
    if (/\/login(\?|$)/.test(location)) {
      throw new Error(
        `POST ${path} reboto al login (${location}).\n` +
          `El contexto no esta autenticado, o el usuario no tiene permiso sobre este recurso.`,
      );
    }
    return location;
  }

  if (status === 200) {
    const html = await response.text();
    const errors = [...globalErrors(html), ...fieldErrors(html)];
    throw new Error(
      `POST ${path} fue rechazado por la app (200, se repinto el form).\n` +
        (errors.length
          ? `Errores de validacion:\n${errors.map((error) => `  - ${error}`).join('\n')}`
          : 'No encontre mensajes de error en la pantalla; mira el HTML de la respuesta.'),
    );
  }

  if (status === 403) {
    throw new Error(
      `POST ${path} contesto 403 con un token de CSRF fresco: es un problema de permisos.\n` +
        `Ese usuario no es dueño del torneo ni ADMIN.`,
    );
  }

  throw new Error(`POST ${path} contesto ${status} ${response.statusText()}.`);
}

/**
 * Espera que el POST sea rechazado y devuelve los errores que pinto la
 * pantalla. Es el complemento de `submit` para los tests de validacion, que
 * quieren afirmar sobre el rechazo en vez de tratarlo como una falla.
 */
export async function submitExpectingRejection(
  request: APIRequestContext,
  path: string,
  data: FormData = {},
): Promise<string[]> {
  const response = await post(request, path, data);
  if (response.status() !== 200) {
    throw new Error(
      `Esperaba que la app rechazara POST ${path} y contesto ${response.status()}.`,
    );
  }
  const html = await response.text();
  return [...globalErrors(html), ...fieldErrors(html)];
}
