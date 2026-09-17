/**
 * Permisos: quien entra a que.
 *
 * Todas las reglas viven centralizadas en `WebAuthConfig` (matchers y
 * `@tournamentAuthorization`), asi que este archivo es el que se rompe si
 * alguien afloja una sin querer. Es tambien el requisito de "niveles de acceso
 * por permisos" de la materia, o sea lo que mas conviene tener probado.
 */
import { expect, test, api } from '../fixtures';

test('un visitante sin cuenta ve el tablero, el detalle y los perfiles', async ({
  actors,
  scenario,
  page,
  discoverPage,
  tournamentPage,
}) => {
  const torneo = await scenario.open({ name: 'Copa Publica' });
  const anonimo = await actors.anonymous();

  await discoverPage.goto();
  await expect(discoverPage.card(torneo.name)).toBeVisible();

  await tournamentPage.goto(torneo.id);
  await expect(tournamentPage.title).toHaveText(torneo.name);

  // El perfil de jugador tambien es publico.
  expect((await anonimo.get(`/jugadores/${torneo.owner.id}`)).status()).toBe(200);
});

test('mis torneos pide login y despues devuelve a donde se queria ir', async ({
  actors,
  page,
  loginPage,
}) => {
  const usuario = await actors.register('vuelve-a-mis-torneos');

  await page.goto('/mis-torneos');
  await expect(page).toHaveURL(/\/login/);

  await loginPage.login(usuario.email, usuario.password);

  // El saved request de Spring gana sobre el defaultSuccessUrl.
  await expect(page).toHaveURL(/\/mis-torneos/);
});

test('anotarse sin sesion pasa por el login y vuelve con el formulario abierto', async ({
  actors,
  scenario,
  page,
  tournamentPage,
  loginPage,
}) => {
  const torneo = await scenario.open({ name: 'Copa Con Login' });
  const capitan = await actors.register('quiere-anotarse');

  await tournamentPage.goto(torneo.id);
  await tournamentPage.joinLink.click();

  await expect(page).toHaveURL(/\/login/);
  await loginPage.login(capitan.email, capitan.password);

  // `/participar` existe justamente para esto: es la URL que Spring guarda.
  await expect(page).toHaveURL(new RegExp(`/torneos/${torneo.id}\\?anotar=true`));
  await expect(tournamentPage.joinDialog).toBeVisible();
});

test('un usuario cualquiera no puede gestionar un torneo ajeno', async ({ actors, scenario }) => {
  const torneo = await scenario.open();
  const intruso = await actors.register('intruso');

  const respuesta = await intruso.request.get(`/torneos/${torneo.id}/gestion`);

  expect(respuesta.status()).toBe(403);
});

test('un admin si puede gestionar un torneo ajeno', async ({ actors, scenario }) => {
  const torneo = await scenario.open();
  const admin = await actors.admin('admin');

  const respuesta = await admin.request.get(`/torneos/${torneo.id}/gestion`);

  expect(respuesta.status()).toBe(200);
});

test('no se puede retirar un equipo de un torneo en el que no se juega', async ({
  actors,
  scenario,
}) => {
  const torneo = await scenario.withPendingTeams({ teams: 2 });
  const ajeno = await actors.register('no-juega');

  const respuesta = await api.post(ajeno.request, `/torneos/${torneo.id}/salir`);

  expect(respuesta.status()).toBe(403);
});

test('un torneo que no existe da 404 y no 403', async ({ actors }) => {
  // La autorizacion deja pasar el id inexistente a proposito, para que el
  // controller conteste "no existe" en vez de "no podes": un 403 aca le
  // confirmaria a cualquiera que ese torneo existe.
  const usuario = await actors.register('curioso');

  const respuesta = await usuario.request.get('/torneos/999999/gestion');

  expect(respuesta.status()).toBe(404);
});

test('la planilla de estadisticas es solo del organizador', async ({ actors, scenario }) => {
  const { tournament, match } = await scenario.withMatchSheet({ teams: 2 });
  const intruso = await actors.register('mirón');

  const respuesta = await intruso.request.get(
    `/torneos/${tournament.id}/gestion/partidos/${match.id}/estadisticas`,
  );

  expect(respuesta.status()).toBe(403);
});
