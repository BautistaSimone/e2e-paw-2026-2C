/** ¿Esta la app arriba? Lo usan los scripts para avisar en vez de fallar feo. */
import { baseUrl } from './config';

export async function isAppRunning(): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function requireApp(): Promise<void> {
  if (await isAppRunning()) return;
  throw new Error(
    `La app no contesta en ${baseUrl}.\n` +
      `Levantala en otra terminal con:  npm run app\n` +
      `(los tests la levantan solos; esto es solo para los scripts sueltos)`,
  );
}
