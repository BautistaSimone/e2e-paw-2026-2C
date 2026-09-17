/**
 * El torneo jugandose: arrancarlo, cargar resultados, avanzar y cerrarlo.
 *
 * Las reglas que se prueban son del service (`TournamentServiceImpl`): no se
 * arranca con inscripciones sin resolver ni con menos equipos que el minimo del
 * formato, no se avanza con la fecha incompleta, y en eliminacion un empate
 * necesita que alguien elija quien paso.
 */
import { expect, test, api, ids, scenarios, pagesOf } from '../fixtures';

test('iniciar genera el fixture y le avisa a cada capitan', async ({ scenario, mail }) => {
  const torneo = await scenario.readyToStart({ teams: 4, name: 'Copa Que Arranca' });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.start();

  expect(await ids.tournamentStatus(torneo.id)).toBe('IN_PROGRESS');
  expect((await ids.matchesOf(torneo.id)).length).toBeGreaterThan(0);

  for (const equipo of torneo.teams) {
    await mail.waitForMail({ to: equipo.captain.email, subject: torneo.name });
  }
});

test('no se puede iniciar con inscripciones sin resolver', async ({ scenario }) => {
  const torneo = await scenario.withPendingTeams({ teams: 4 });

  const destino = await api.startExpectingRejection(torneo.owner.request, torneo.id);

  expect(destino).toContain('PENDING_REGISTRATIONS');
  expect(await ids.tournamentStatus(torneo.id)).toBe('REGISTRATION_OPEN');
});

test('no se puede iniciar con menos equipos que el minimo', async ({ scenario }) => {
  const torneo = await scenario.readyToStart({ teams: 1 });

  const destino = await api.startExpectingRejection(torneo.owner.request, torneo.id);

  expect(destino).toContain('NOT_ENOUGH_TEAMS');
  expect(await ids.tournamentStatus(torneo.id)).toBe('REGISTRATION_OPEN');
});

test('la fase de grupos necesita cuatro equipos, no dos', async ({ scenario }) => {
  const torneo = await scenario.readyToStart({ teams: 2, format: 'GROUP_STAGE' });

  const destino = await api.startExpectingRejection(torneo.owner.request, torneo.id);

  expect(destino).toContain('NOT_ENOUGH_TEAMS');
});

test('con la fecha sin terminar no se puede avanzar', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');

  await expect(management.advanceButton).toBeDisabled();
  await expect(management.advanceHelp).toBeVisible();
});

test('cargar los resultados de la fecha habilita avanzar', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');

  // El boton de guardar nace apagado hasta que se carga un marcador.
  const filas = await management.resultRows.count();
  for (let fila = 0; fila < filas; fila++) await management.fillResult(fila, 3, 1);
  await management.saveResults();

  await management.openTab('partidos');
  await expect(management.advanceButton).toBeEnabled();

  const jugados = (await ids.currentRoundMatches(torneo.id)).filter(
    (partido) => partido.status === 'PLAYED',
  );
  expect(jugados.length).toBe(filas);
});

test('avanzar cierra la fecha y abre la siguiente', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  await scenario.playCurrentRound(torneo);
  const { management } = await pagesOf(torneo.owner);

  const antes = await scenarios.currentRound(torneo.id);
  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');
  await management.advance();

  const despues = await scenarios.currentRound(torneo.id);
  expect(despues?.id).not.toBe(antes?.id);
  expect((await ids.roundsOf(torneo.id)).find((fecha) => fecha.id === antes?.id)?.status).toBe(
    'COMPLETED',
  );
});

test('se puede reabrir la fecha anterior', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4, round: 2 });
  const { management } = await pagesOf(torneo.owner);
  const antesDeReabrir = await scenarios.currentRound(torneo.id);

  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');
  await management.reopen();

  const ahora = await scenarios.currentRound(torneo.id);
  expect(ahora?.roundNumber).toBe((antesDeReabrir?.roundNumber ?? 0) - 1);
});

test('un partido de la fecha en juego se puede postergar', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');
  await management.postponeMatch(0);

  const postergados = (await ids.currentRoundMatches(torneo.id)).filter(
    (partido) => partido.status === 'POSTPONED',
  );
  expect(postergados).toHaveLength(1);
});

test('en eliminacion un empate no se guarda sin elegir quien paso', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4, format: 'SINGLE_ELIMINATION' });
  const partidos = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id));

  const errores = await api.submitExpectingRejection(
    torneo.owner.request,
    `/torneos/${torneo.id}/gestion/resultados`,
    Object.fromEntries(
      partidos.flatMap((partido, i) => [
        [`matches[${i}].matchId`, partido.id],
        [`matches[${i}].homeGoals`, 1],
        [`matches[${i}].awayGoals`, 1],
      ]),
    ),
  );

  expect(errores.length).toBeGreaterThan(0);
});

test('en eliminacion el empate se guarda eligiendo al que pasa', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4, format: 'SINGLE_ELIMINATION' });
  const partidos = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id));

  await api.saveResults(
    torneo.owner.request,
    torneo.id,
    partidos.map((partido) => ({
      matchId: partido.id,
      homeGoals: 1,
      awayGoals: 1,
      winnerRegistrationId: partido.homeRegistrationId!,
    })),
  );

  const guardados = await ids.currentRoundMatches(torneo.id);
  expect(guardados.every((partido) => partido.status === 'PLAYED')).toBe(true);
});

test('jugar hasta el final deja el torneo terminado y con campeon', async ({ scenario }) => {
  const torneo = await scenario.finished({ teams: 4, format: 'SINGLE_ELIMINATION' });

  expect(await ids.tournamentStatus(torneo.id)).toBe('FINISHED');
  const campeon = await ids.championOf(torneo.id);
  expect(campeon).not.toBeNull();
  expect(torneo.teams.map((equipo) => equipo.name)).toContain(campeon!);
});

test('con equipos impares alguien queda libre esa fecha', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 3 });

  const libres = (await ids.matchesOf(torneo.id)).filter((partido) => partido.status === 'BYE');

  expect(libres.length).toBeGreaterThan(0);
});
