/**
 * Cliente HTTP contra la app, tal como la usa un browser: forms
 * `application/x-www-form-urlencoded`, sin JSON ni endpoints especiales.
 *
 * Los controllers contestan un redirect (302) cuando la operacion salio y
 * vuelven a pintar la pantalla (200) cuando el form fue rechazado. Por eso se
 * corta el seguimiento de redirects: es la unica forma de distinguir "se hizo"
 * de "lo rechazo la validacion". Y cuando rechaza, el error sale del HTML, que
 * es la mitad del debugging.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

export type FormValue = string | number | boolean | null | undefined;
export type FormData = Record<string, FormValue>;

/** Descarta los campos vacios: un form del browser tampoco los manda. */
export function toForm(data: FormData): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

export async function post(
  request: APIRequestContext,
  path: string,
  data: FormData = {},
): Promise<APIResponse> {
  return request.post(path, { form: toForm(data), maxRedirects: 0 });
}

/** Errores de validacion que el `.tag` formInput pinta debajo de cada campo. */
function fieldErrors(html: string): string[] {
  const matches = html.matchAll(/class="campo__error"[^>]*>([^<]+)</g);
  return [...matches].map((match) => match[1]!.trim()).filter(Boolean);
}

/**
 * Hace el POST y exige que la app haya redirigido, o sea que la operacion se
 * concreto. Si fue rechazada, el error dice por que en vez de fallar 3 pasos
 * despues con "no encuentro el torneo".
 */
export async function submit(
  request: APIRequestContext,
  path: string,
  data: FormData = {},
): Promise<string> {
  const response = await post(request, path, data);
  const status = response.status();

  if (status >= 300 && status < 400) {
    return response.headers()['location'] ?? '';
  }
  if (status === 200) {
    const errors = fieldErrors(await response.text());
    throw new Error(
      `POST ${path} fue rechazado por la app (200, se repinto el form).\n` +
        (errors.length
          ? `Errores de validacion:\n${errors.map((error) => `  - ${error}`).join('\n')}`
          : 'No encontre mensajes de error en la pantalla; mira el HTML de la respuesta.'),
    );
  }
  throw new Error(`POST ${path} contesto ${status} ${response.statusText()}.`);
}
