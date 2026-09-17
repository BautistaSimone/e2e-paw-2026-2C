/** El perfil del usuario logueado. Espejo de PlayerController#updateName. */
import type { APIRequestContext } from '@playwright/test';

import { submit, submitExpectingRejection } from './client';

/**
 * Cambia el nombre visible. Siempre el del usuario autenticado: el endpoint no
 * recibe a quien se le cambia, asi que no hay forma de tocar el de otro.
 */
export async function setDisplayName(
  request: APIRequestContext,
  displayName: string,
): Promise<string> {
  return submit(request, '/perfil/nombre', { displayName });
}

export async function setDisplayNameExpectingRejection(
  request: APIRequestContext,
  displayName: string,
): Promise<string[]> {
  return submitExpectingRejection(request, '/perfil/nombre', { displayName });
}
