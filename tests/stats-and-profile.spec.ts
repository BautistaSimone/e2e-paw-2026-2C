/**
 * Las estadisticas: los rankings del torneo y el perfil publico del jugador.
 *
 * Todo lo que se ve aca sale de `match_events`, o sea de lo que el organizador
 * cargo en las planillas. Sin planilla no hay numeros.
 */
import { expect, test, api, ids, pagesOf } from '../fixtures';

test('los rankings del torneo muestran al goleador y al asistidor', async ({
  scenario,
  page,
  tournamentPage,
}) => {
  const { tournament, scorer, assistant } = await scenario.withMatchSheet({ teams: 2 });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.openTab('estadisticas');

  const goleadores = tournamentPage.ranking('goles');
  await expect(goleadores).toBeVisible();
  await expect(goleadores).toContainText(scorer.email.split('@')[0]!, { ignoreCase: true });

  await expect(tournamentPage.ranking('asistencias')).toContainText(
    assistant.email.split('@')[0]!,
    { ignoreCase: true },
  );
  await expect(tournamentPage.ranking('figuras')).toContainText(scorer.email.split('@')[0]!, {
    ignoreCase: true,
  });
  await expect(tournamentPage.ranking('amarillas')).toContainText(
    assistant.email.split('@')[0]!,
    { ignoreCase: true },
  );
});

test('desde el ranking se llega al perfil del jugador', async ({
  scenario,
  page,
  tournamentPage,
}) => {
  const { tournament, scorer } = await scenario.withMatchSheet({ teams: 2 });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.openTab('estadisticas');
  await tournamentPage.ranking('goles').getByRole('link').first().click();

  await expect(page).toHaveURL(new RegExp(`/jugadores/${scorer.id}`));
});

test('el perfil publico cuenta los goles, asistencias, figuras y tarjetas', async ({
  scenario,
  profilePage,
}) => {
  const { scorer, assistant } = await scenario.withMatchSheet({ teams: 2 });

  await profilePage.goto(scorer.id);

  await expect(profilePage.stat('goals')).toHaveText('1');
  await expect(profilePage.stat('mvps')).toHaveText('1');
  await expect(profilePage.stat('matches')).toHaveText('1');

  await profilePage.goto(assistant.id);
  await expect(profilePage.stat('assists')).toHaveText('1');
  await expect(profilePage.stat('yellowCards')).toHaveText('1');
});

test('el perfil destaca los torneos ganados', async ({ scenario, profilePage }) => {
  const torneo = await scenario.finished({ teams: 2, name: 'Copa Del Campeon' });
  const campeon = await ids.championOf(torneo.id);
  const equipoCampeon = torneo.teams.find((equipo) => equipo.name === campeon)!;

  await profilePage.goto(equipoCampeon.captain.id);

  await expect(profilePage.stat('titles')).toHaveText('1');
  await expect(profilePage.championRows).toHaveCount(1);
  await expect(profilePage.tournaments.first()).toContainText(torneo.name);
});

test('el perfil de un jugador es publico para cualquiera', async ({
  scenario,
  page,
  profilePage,
}) => {
  const { scorer } = await scenario.withMatchSheet({ teams: 2 });

  // `page` es el visitante anonimo de Playwright: no tiene sesion.
  const respuesta = await page.goto(`/jugadores/${scorer.id}`);

  expect(respuesta?.status()).toBe(200);
  await expect(profilePage.name).toBeVisible();
  // Nadie que no sea el dueño puede cambiarle el nombre.
  await expect(profilePage.nameForm).toHaveCount(0);
});

test('cada uno puede cambiar su propio nombre visible', async ({ actors }) => {
  const jugador = await actors.register('cambia-nombre');
  const { profile } = await pagesOf(jugador);

  await profile.goto(jugador.id);
  // El boton nace apagado: sin un cambio real no hay nada que guardar.
  await expect(profile.saveNameButton).toBeDisabled();

  await profile.setDisplayName('Pipa Higuain');

  await expect(profile.flash.ok).toBeVisible();
  await expect(profile.name).toHaveText('Pipa Higuain');
  expect((await ids.userByEmail(jugador.email)).displayName).toBe('Pipa Higuain');
});

test('un nombre vacio no se guarda', async ({ actors }) => {
  const jugador = await actors.register('nombre-vacio');

  const errores = await api.setDisplayNameExpectingRejection(jugador.request, '   ');

  expect(errores.length).toBeGreaterThan(0);
  expect((await ids.userByEmail(jugador.email)).displayName).toBeNull();
});

test('el historial del perfil tolera una pagina invalida', async ({ actors }) => {
  const jugador = await actors.register('paginas');
  const anonimo = await actors.anonymous();

  // Fuera de rango: pantalla vacia con salida, no un 500.
  expect((await anonimo.get(`/jugadores/${jugador.id}?pagina=50`)).status()).toBe(200);
  // Invalida: 400.
  expect((await anonimo.get(`/jugadores/${jugador.id}?pagina=-1`)).status()).toBe(400);
});
