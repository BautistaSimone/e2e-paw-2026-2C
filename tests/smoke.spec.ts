/**
 * Que la app este viva y que el andamiaje de la suite funcione: escenarios por
 * API, base limpia por test y navegacion real.
 */
import { expect, test } from '../fixtures';

test('la home lista los torneos publicados', async ({ page, scenario, discoverPage }) => {
  const tournament = await scenario.open({ name: 'Copa Smoke' });

  await discoverPage.goto();

  await expect(discoverPage.card(tournament.name)).toBeVisible();
  await expect(page).toHaveTitle(/./);
});

test('un torneo en borrador no aparece en la home', async ({ scenario, discoverPage }) => {
  const draft = await scenario.draft({ name: 'Copa Borrador' });

  await discoverPage.goto();

  await expect(discoverPage.card(draft.name)).toHaveCount(0);
});

test('el buscador filtra por nombre', async ({ scenario, discoverPage }) => {
  const buscado = await scenario.open({ name: 'Copa Verano' });
  const otro = await scenario.open({ name: 'Liga Invierno' });

  await discoverPage.goto();
  await discoverPage.search('Verano');

  await expect(discoverPage.card(buscado.name)).toBeVisible();
  await expect(discoverPage.card(otro.name)).toHaveCount(0);
});

test('desde la tarjeta se abre el detalle del torneo', async ({
  page,
  scenario,
  discoverPage,
}) => {
  const tournament = await scenario.withPendingTeams({ name: 'Copa Detalle', teams: 2 });

  await discoverPage.goto();
  await discoverPage.open(tournament.name);

  await expect(page).toHaveURL(new RegExp(`/torneos/${tournament.id}$`));
  await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible();
});
