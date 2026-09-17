/**
 * Como se ve cada formato: liga con tabla, eliminacion con cuadro, grupos con
 * una tabla por zona.
 *
 * La pantalla esconde los tabs que no aplican, y eso es parte del
 * comportamiento: una liga no tiene cuadro y una eliminacion no tiene tabla de
 * posiciones.
 */
import { expect, test, ids } from '../fixtures';

test('la liga muestra la tabla de posiciones y no un cuadro', async ({
  scenario,
  tournamentPage,
}) => {
  const torneo = await scenario.inProgress({ teams: 4, format: 'LEAGUE' });
  await scenario.playCurrentRound(torneo);

  await tournamentPage.goto(torneo.id);

  await expect(tournamentPage.tabButton('cuadro')).toHaveCount(0);
  await tournamentPage.openTab('posiciones');
  await expect(tournamentPage.standings).toBeVisible();
});

test('la tabla reparte tres puntos al que gana', async ({ scenario, tournamentPage }) => {
  const torneo = await scenario.inProgress({ teams: 2, format: 'LEAGUE' });
  // El local gana 2-1: tres puntos para uno, cero para el otro.
  const [partido] = await scenario.playCurrentRound(torneo);

  await tournamentPage.goto(torneo.id);
  await tournamentPage.openTab('posiciones');

  const lider = tournamentPage.standingsRows.first();
  await expect(lider).toContainText(partido!.homeTeam!);
  await expect(lider).toContainText('3');
});

test('la eliminacion directa muestra el cuadro y no la tabla', async ({
  scenario,
  tournamentPage,
}) => {
  const torneo = await scenario.inProgress({ teams: 4, format: 'SINGLE_ELIMINATION' });

  await tournamentPage.goto(torneo.id);

  await expect(tournamentPage.tabButton('posiciones')).toHaveCount(0);
  await tournamentPage.openTab('cuadro');
  await expect(tournamentPage.bracket).toBeVisible();
});

test('la fase de grupos arma una tabla por zona', async ({ scenario, tournamentPage }) => {
  const torneo = await scenario.inProgress({ teams: 4, format: 'GROUP_STAGE' });
  await scenario.playCurrentRound(torneo);

  await tournamentPage.goto(torneo.id);
  await tournamentPage.openTab('posiciones');

  await expect(tournamentPage.standingsTables.first()).toBeVisible();
  // El fixture de grupos numera sus fechas por zona.
  const fechas = await ids.roundsOf(torneo.id);
  expect(fechas.some((fecha) => fecha.phase === 'GROUP')).toBe(true);
});

test('el fixture agrupa los partidos por fecha', async ({ scenario, tournamentPage }) => {
  const torneo = await scenario.inProgress({ teams: 4 });

  await tournamentPage.goto(torneo.id);
  const fixture = await tournamentPage.openTab('fixture');

  const partidos = await ids.matchesOf(torneo.id);
  await expect(fixture).toContainText(partidos[0]!.homeTeam ?? '');
});

test('el torneo terminado muestra a su campeon en el resumen', async ({
  scenario,
  tournamentPage,
}) => {
  const torneo = await scenario.finished({ teams: 4, format: 'SINGLE_ELIMINATION' });
  const campeon = await ids.championOf(torneo.id);

  await tournamentPage.goto(torneo.id);
  const resumen = await tournamentPage.openTab('resumen');

  await expect(tournamentPage.status).toHaveAttribute('data-tournament-status', 'FINISHED');
  await expect(resumen).toContainText(campeon!);
});
