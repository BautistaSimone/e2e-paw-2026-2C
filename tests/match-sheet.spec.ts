/**
 * La planilla del partido: quien hizo cada gol, las tarjetas y la figura.
 *
 * La regla central es que la planilla tiene que cuadrar con el marcador: una
 * fila de gol por cada gol, de cada lado. Una fila sin autor es un gol que
 * nadie se adjudica — cuenta en el resultado y no deja evento.
 */
import { expect, test, api, ids, scenarios, pagesOf } from '../fixtures';
import type { ScenarioFixture } from '../fixtures';

/** Deja un partido jugado 2-0 y devuelve el partido con el plantel local. */
async function playedMatch(scenario: ScenarioFixture) {
  const torneo = await scenario.inProgress({ teams: 2, playersPerTeam: 2 });
  const partido = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id))[0]!;
  await api.saveResults(torneo.owner.request, torneo.id, [
    { matchId: partido.id, homeGoals: 2, awayGoals: 0 },
  ]);
  const local = (await ids.registrationsOf(torneo.id)).find(
    (fila) => fila.id === partido.homeRegistrationId,
  )!;
  return { torneo, partido, plantel: await ids.rosterOf(local.teamId) };
}

test('el organizador carga goles, tarjeta y figura desde la pantalla', async ({ scenario }) => {
  const { torneo, partido, plantel } = await playedMatch(scenario);
  const [autor, asistente] = plantel;
  const { sheet } = await pagesOf(torneo.owner);

  await sheet.goto(torneo.id, partido.id);
  // La pantalla pide exactamente los dos goles del marcador.
  await expect(sheet.goalRows('homeGoals')).toHaveCount(2);

  await sheet.fillGoal('homeGoals', 0, {
    scorerId: autor!.id,
    assistId: asistente!.id,
    minute: 23,
  });
  await sheet.fillGoal('homeGoals', 1, { scorerId: asistente!.id, minute: 71 });
  await sheet.addCard(0, { playerId: asistente!.id, type: 'YELLOW_CARD', minute: 40 });
  await sheet.setMvp(autor!.id);
  await sheet.save();

  await expect(sheet.flash.ok).toBeVisible();

  const eventos = await ids.eventsOf(partido.id);
  const goles = eventos.filter((evento) => evento.type === 'GOAL');
  expect(goles).toHaveLength(2);
  expect(goles[0]).toMatchObject({ playerId: autor!.id, assistPlayerId: asistente!.id, minute: 23 });
  expect(eventos.filter((evento) => evento.type === 'YELLOW_CARD')).toHaveLength(1);
  expect(eventos.filter((evento) => evento.type === 'MVP')).toHaveLength(1);
});

test('un gol sin autor cuenta en el marcador y no deja evento', async ({ scenario }) => {
  const { torneo, partido, plantel } = await playedMatch(scenario);

  await api.saveSheet(torneo.owner.request, torneo.id, partido.id, {
    homeGoals: [{ scorerId: plantel[0]!.id, minute: 10 }, {}],
  });

  const goles = (await ids.eventsOf(partido.id)).filter((evento) => evento.type === 'GOAL');
  expect(goles).toHaveLength(1);
  // El marcador no se toca: sigue 2-0.
  const guardado = (await ids.matchesOf(torneo.id)).find((fila) => fila.id === partido.id);
  expect(guardado).toMatchObject({ homeGoals: 2, awayGoals: 0 });
});

test('nadie se asiste a si mismo', async ({ scenario }) => {
  const { torneo, partido, plantel } = await playedMatch(scenario);
  const autor = plantel[0]!;

  const errores = await api.saveSheetExpectingRejection(
    torneo.owner.request,
    torneo.id,
    partido.id,
    { homeGoals: [{ scorerId: autor.id, assistId: autor.id, minute: 10 }, {}] },
  );

  expect(errores.length).toBeGreaterThan(0);
  expect(await ids.eventsOf(partido.id)).toHaveLength(0);
});

test('un minuto fuera del partido se rechaza', async ({ scenario }) => {
  const { torneo, partido, plantel } = await playedMatch(scenario);

  const errores = await api.saveSheetExpectingRejection(
    torneo.owner.request,
    torneo.id,
    partido.id,
    { homeGoals: [{ scorerId: plantel[0]!.id, minute: 999 }, {}] },
  );

  expect(errores.length).toBeGreaterThan(0);
});

test('una tarjeta sin jugador elegido se rechaza', async ({ scenario }) => {
  const { torneo, partido, plantel } = await playedMatch(scenario);

  const errores = await api.submitExpectingRejection(
    torneo.owner.request,
    api.sheetPath(torneo.id, partido.id),
    {
      'homeGoals[0].scorerId': plantel[0]!.id,
      'homeGoals[1].scorerId': '',
      'cards[0].playerId': '',
      'cards[0].type': 'YELLOW_CARD',
      'cards[0].minute': 30,
    },
  );

  expect(errores.length).toBeGreaterThan(0);
});

test('lo cargado en la planilla se ve en el fixture publico', async ({ scenario, page }) => {
  const { tournament, match, scorer } = await scenario.withMatchSheet({ teams: 2 });
  const { tournament: detalle } = await pagesOf(tournament.owner);

  await detalle.goto(tournament.id);
  const fixture = await detalle.openTab('fixture');

  // El nombre del autor del gol aparece bajo el partido jugado.
  await expect(fixture).toContainText(scorer.email.split('@')[0]!, { ignoreCase: true });
  expect((await ids.eventsOf(match.id)).length).toBeGreaterThan(0);
});
