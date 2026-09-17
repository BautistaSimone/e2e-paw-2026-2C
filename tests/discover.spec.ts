/**
 * El tablero publico: que se lista, que se esconde, y los filtros.
 *
 * Los filtros son la "busqueda vertical" que pide la materia, y estan hechos
 * con un form GET, asi que viven en la URL: eso es lo que hace que sobrevivan a
 * paginar y que un link filtrado se pueda compartir.
 */
import { expect, test } from '../fixtures';

/** Tamaño de pagina del tablero (`TournamentController`). */
const PAGE_SIZE = 9;

test('lista los torneos publicados', async ({ scenario, discoverPage }) => {
  const torneo = await scenario.open({ name: 'Copa Visible' });

  await discoverPage.goto();

  await expect(discoverPage.card(torneo.name)).toBeVisible();
});

test('un torneo en borrador no aparece', async ({ scenario, discoverPage }) => {
  const borrador = await scenario.draft({ name: 'Copa Borrador' });

  await discoverPage.goto();

  await expect(discoverPage.card(borrador.name)).toHaveCount(0);
});

test('el buscador filtra por nombre', async ({ actors, scenario, discoverPage }) => {
  const owner = await actors.register('organizador');
  const buscado = await scenario.open({ owner, name: 'Copa Verano' });
  const otro = await scenario.open({ owner, name: 'Liga Invierno' });

  await discoverPage.goto();
  await discoverPage.searchFor('Verano');

  await expect(discoverPage.card(buscado.name)).toBeVisible();
  await expect(discoverPage.card(otro.name)).toHaveCount(0);
});

test('se puede filtrar por formato y el filtro queda en la URL', async ({
  actors,
  scenario,
  page,
  discoverPage,
}) => {
  const owner = await actors.register('organizador');
  const liga = await scenario.open({ owner, name: 'Liga Filtrada', format: 'LEAGUE' });
  const copa = await scenario.open({
    owner,
    name: 'Copa Filtrada',
    format: 'SINGLE_ELIMINATION',
  });

  await discoverPage.goto();
  await discoverPage.filterBy('formato', 'SINGLE_ELIMINATION');

  await expect(discoverPage.card(copa.name)).toBeVisible();
  await expect(discoverPage.card(liga.name)).toHaveCount(0);
  await expect(page).toHaveURL(/formato=SINGLE_ELIMINATION/);
});

test('se puede filtrar por modalidad', async ({ actors, scenario, discoverPage }) => {
  const owner = await actors.register('organizador');
  const cinco = await scenario.open({ owner, name: 'Futbol Cinco', playersPerSide: 'FIVE' });
  const once = await scenario.open({ owner, name: 'Futbol Once', playersPerSide: 'ELEVEN' });

  await discoverPage.goto();
  await discoverPage.filterBy('modalidad', 'ELEVEN');

  await expect(discoverPage.card(once.name)).toBeVisible();
  await expect(discoverPage.card(cinco.name)).toHaveCount(0);
});

test('sin resultados ofrece limpiar los filtros', async ({ scenario, discoverPage }) => {
  await scenario.open({ name: 'Copa Sola' });

  await discoverPage.goto();
  await discoverPage.searchFor('no-existe-este-torneo');

  await expect(discoverPage.cards).toHaveCount(0);
  await expect(discoverPage.emptyState).toBeVisible();

  await discoverPage.emptyStateAction.click();
  await expect(discoverPage.card('Copa Sola')).toBeVisible();
});

test('pagina de a nueve y el filtro sobrevive al salto de pagina', async ({
  actors,
  scenario,
  page,
  discoverPage,
}) => {
  const owner = await actors.register('prolifico');
  for (let i = 1; i <= PAGE_SIZE + 2; i++) {
    await scenario.open({ owner, name: `Copa Paginada ${i}` });
  }

  await discoverPage.goto();
  await discoverPage.filterBy('formato', 'LEAGUE');
  await expect(discoverPage.cards).toHaveCount(PAGE_SIZE);

  await discoverPage.nextPage.click();

  await expect(discoverPage.cards).toHaveCount(2);
  await expect(page).toHaveURL(/formato=LEAGUE/);
});

test('una pagina que se pasa del final ofrece volver al principio, no explota', async ({
  scenario,
  page,
  discoverPage,
}) => {
  await scenario.open({ name: 'Copa Unica' });

  const respuesta = await page.goto('/?pagina=50');

  expect(respuesta?.status()).toBe(200);
  await expect(discoverPage.emptyState).toBeVisible();
});

test('una pagina invalida da 400 y no 500', async ({ actors }) => {
  const anonimo = await actors.anonymous();

  expect((await anonimo.get('/?pagina=-1')).status()).toBe(400);
  expect((await anonimo.get('/?pagina=no-es-un-numero')).status()).toBe(400);
});
