/**
 * `/mis-torneos`: crear un torneo y encontrar despues los propios.
 *
 * Los dos tabs son la unica pantalla donde aparecen los torneos en DRAFT, que
 * no salen en el tablero publico.
 */
import { expect, test, ids, pagesOf } from '../fixtures';
import { inDays } from '../lib/api';

test('crear un torneo lleva derecho a completarlo', async ({ actors }) => {
  const organizador = await actors.register('organizador');
  const { page, myTournaments, management } = await pagesOf(organizador);

  await myTournaments.goto();
  await myTournaments.createTournament({
    name: 'Copa Recien Creada',
    maxTeams: 8,
    format: 'LEAGUE',
    playersPerSide: 'FIVE',
    startsAt: inDays(30),
    location: 'Cancha 1',
  });

  // Cae en la gestion, en el tab de datos, para terminar de cargarlo.
  await expect(page).toHaveURL(/\/torneos\/\d+\/gestion/);
  await expect(management.tabs.panel('datos')).toBeVisible();

  const id = await ids.tournamentIdByName('Copa Recien Creada');
  expect(await ids.tournamentStatus(id)).toBe('DRAFT');
});

test('un torneo rechazado vuelve con el modal abierto y lo cargado adentro', async ({
  actors,
}) => {
  const organizador = await actors.register('organizador');
  const { page, myTournaments } = await pagesOf(organizador);

  await myTournaments.goto();
  await myTournaments.openCreateDialog();
  await myTournaments.fillCreateForm({
    name: 'Copa Muy Lejana',
    maxTeams: 8,
    format: 'LEAGUE',
    playersPerSide: 'FIVE',
    location: 'Cancha 1',
  });

  // El `max` del input frena la fecha en el browser; se saca para probar la
  // validacion del servidor, que es la que realmente protege el dato.
  await myTournaments.relaxStartDateLimit();
  await myTournaments.value('fecha-inicio').fill(inDays(365 * 5));
  await myTournaments.submitCreateForm();
  await page.waitForLoadState();

  await expect(myTournaments.createDialog).toBeVisible();
  await expect(myTournaments.error('fecha-inicio')).toBeVisible();
  // Lo que ya habia cargado sigue ahi: no hay que tipear todo de nuevo.
  await expect(myTournaments.value('nombre-torneo')).toHaveValue('Copa Muy Lejana');
  await expect(myTournaments.value('cancha')).toHaveValue('Cancha 1');
});

test('el tab de organizados muestra los borradores', async ({ actors, scenario }) => {
  const organizador = await actors.register('organizador');
  const borrador = await scenario.draft({ owner: organizador, name: 'Copa En Borrador' });
  const { myTournaments } = await pagesOf(organizador);

  await myTournaments.goto('ORGANIZED');

  await expect(myTournaments.card(borrador.name)).toBeVisible();
});

test('el tab de inscriptos muestra donde juego, no donde organizo', async ({
  actors,
  scenario,
}) => {
  const organizador = await actors.register('organizador');
  const propio = await scenario.open({ owner: organizador, name: 'Copa Que Organizo' });
  const ajeno = await scenario.open({ name: 'Copa Que Juego' });

  // El organizador se anota como capitan en el torneo de otro.
  const { myTournaments, tournament } = await pagesOf(organizador);
  await tournament.goto(ajeno.id);
  await tournament.join('Equipo Visitante');

  await myTournaments.goto('ENROLLED');

  await expect(myTournaments.card(ajeno.name)).toBeVisible();
  await expect(myTournaments.card(propio.name)).toHaveCount(0);
});

test('buscar no te saca del tab en el que estabas', async ({ actors, scenario }) => {
  const organizador = await actors.register('organizador');
  await scenario.open({ owner: organizador, name: 'Copa Buscada' });
  await scenario.open({ owner: organizador, name: 'Liga Ignorada' });
  const { page, myTournaments } = await pagesOf(organizador);

  await myTournaments.goto('ORGANIZED');
  await myTournaments.searchFor('Buscada');

  await expect(page).toHaveURL(/tab=ORGANIZED/);
  await expect(myTournaments.card('Copa Buscada')).toBeVisible();
  await expect(myTournaments.card('Liga Ignorada')).toHaveCount(0);
});

test('sin torneos organizados ofrece crear el primero', async ({ actors }) => {
  const organizador = await actors.register('estrena');
  const { myTournaments } = await pagesOf(organizador);

  await myTournaments.goto('ORGANIZED');

  await expect(myTournaments.emptyState).toBeVisible();
  await expect(myTournaments.createButton).toBeVisible();
});
