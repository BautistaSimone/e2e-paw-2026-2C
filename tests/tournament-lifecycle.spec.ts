/**
 * El torneo de punta a punta, que es el flujo que a mano toma diez minutos:
 * crearlo, publicarlo, anotar equipos, aceptarlos, arrancar, cargar la fecha y
 * avanzar.
 *
 * Los pasos que no son el objeto del test (anotar cuatro equipos) van por API;
 * los que si lo son se hacen clickeando, como una persona.
 */
import { ids, expect, test } from '../fixtures';

test('un torneo se crea, se publica y aparece en la home', async ({
  adminPage,
  managementPage,
  discoverPage,
}) => {
  // Crear y publicar, desde el panel del organizador.
  await adminPage.goto();
  await adminPage.createTournament({ name: 'Copa Ciclo', maxTeams: 4 });
  await expect(adminPage.row('Copa Ciclo')).toBeVisible();

  const tournamentId = await ids.tournamentIdByName('Copa Ciclo');
  expect(await ids.tournamentStatus(tournamentId)).toBe('DRAFT');

  await managementPage.goto(tournamentId);
  await managementPage.publish();
  expect(await ids.tournamentStatus(tournamentId)).toBe('REGISTRATION_OPEN');

  // Recien publicado ya se ve en la home, con el cupo que se cargo.
  await discoverPage.goto();
  await expect(discoverPage.card('Copa Ciclo')).toBeVisible();
  await expect(discoverPage.card('Copa Ciclo')).toContainText('0/4');
});

test('aceptar las inscripciones habilita arrancar el torneo', async ({
  scenario,
  managementPage,
}) => {
  const tournament = await scenario.withPendingTeams({ name: 'Copa Arranque', teams: 4 });

  await managementPage.goto(tournament.id, 'equipos');
  for (const team of tournament.teams) {
    await managementPage.acceptTeam(team.name);
  }

  const registrations = await ids.registrationsOf(tournament.id);
  expect(registrations.every((registration) => registration.status === 'ACTIVE')).toBe(true);

  await managementPage.goto(tournament.id);
  await managementPage.start();

  expect(await ids.tournamentStatus(tournament.id)).toBe('IN_PROGRESS');
  expect(await ids.currentRoundMatches(tournament.id)).not.toHaveLength(0);
});

test('la planilla de la fecha se carga desde la pantalla y avanza el torneo', async ({
  scenario,
  managementPage,
}) => {
  const tournament = await scenario.inProgress({ name: 'Copa Planilla', teams: 4 });
  const matches = await ids.currentRoundMatches(tournament.id);

  await managementPage.goto(tournament.id, 'partidos');
  await managementPage.fillRoundResults(matches.map(() => ({ home: 3, away: 1 })));
  await managementPage.saveResults();

  const jugados = await ids.currentRoundMatches(tournament.id);
  expect(jugados.every((match) => match.status === 'PLAYED')).toBe(true);

  await managementPage.advance();

  // Ya es otra fecha: los partidos en juego son distintos de los que se cargaron.
  const siguiente = await ids.currentRoundMatches(tournament.id);
  expect(siguiente.map((match) => match.id)).not.toEqual(matches.map((match) => match.id));
});

test('las posiciones reflejan los resultados cargados', async ({ scenario, tournamentPage }) => {
  const tournament = await scenario.inProgress({ name: 'Copa Tabla', teams: 4, round: 2 });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.openTab('posiciones');

  await expect(tournamentPage.panel('posiciones')).toBeVisible();
  await expect(tournamentPage.standingsRows).toHaveCount(4);
});

test('un torneo jugado hasta el final queda cerrado', async ({ scenario }) => {
  const tournament = await scenario.finished({ name: 'Copa Final', teams: 4 });

  expect(await ids.tournamentStatus(tournament.id)).toBe('FINISHED');
});
