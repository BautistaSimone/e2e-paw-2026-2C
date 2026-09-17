/**
 * El calendario: el tentativo que se arma solo, y la agenda que el organizador
 * ajusta despues.
 *
 * Desde el sprint 5 un torneo **nace con el calendario armado**: al crearlo, el
 * service planta las fechas y los partidos con lugares reservados y la cancha
 * por defecto que se eligio. Agendar, entonces, no es cargar de cero sino
 * mover lo que ya esta, y mover un partido ya jugable le avisa a los capitanes.
 */
import { expect, test, api, ids, scenarios, pagesOf } from '../fixtures';

test('un torneo nace con su calendario tentativo', async ({ scenario }) => {
  const torneo = await scenario.draft({ name: 'Copa Con Calendario', maxTeams: 4 });

  const fechas = await ids.roundsOf(torneo.id);
  const partidos = await ids.matchesOf(torneo.id);

  expect(fechas.length).toBeGreaterThan(0);
  expect(partidos.length).toBeGreaterThan(0);
  // Todos arrancan en la cancha que se eligio al crear y sin dia todavia.
  expect(partidos.every((partido) => partido.venue === '1')).toBe(true);
  expect(partidos.every((partido) => partido.matchDate === null)).toBe(true);
});

test('la cancha por defecto es la que se eligio al crear', async ({ actors, scenario }) => {
  const owner = await actors.register('organizador');
  await api.createTournament(owner.request, {
    name: 'Copa En La Tres',
    maxTeams: 4,
    defaultVenue: '3',
  });
  const id = await ids.tournamentIdByName('Copa En La Tres');

  const partidos = await ids.matchesOf(id);

  expect(partidos.every((partido) => partido.venue === '3')).toBe(true);
});

test('crear un torneo sin cancha por defecto es rechazado', async ({ actors }) => {
  const owner = await actors.register('organizador');

  const errores = await api.submitExpectingRejection(owner.request, '/mis-torneos/torneos', {
    name: 'Copa Sin Cancha',
    format: 'LEAGUE',
    maxTeams: 4,
    playersPerSide: 'FIVE',
    startsAt: api.inDays(30),
    location: 'Un club',
    defaultVenue: '',
  });

  expect(errores.length).toBeGreaterThan(0);
});

test('una cancha que no existe es rechazada', async ({ actors }) => {
  const owner = await actors.register('organizador');

  const errores = await api.submitExpectingRejection(owner.request, '/mis-torneos/torneos', {
    name: 'Copa Cancha Fantasma',
    format: 'LEAGUE',
    maxTeams: 4,
    playersPerSide: 'FIVE',
    startsAt: api.inDays(30),
    location: 'Un club',
    defaultVenue: '9',
  });

  expect(errores.length).toBeGreaterThan(0);
});

test('agendar un partido le avisa a los capitanes', async ({ scenario, mail }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const partidos = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id));
  const partido = partidos[0]!;

  await api.saveSchedule(
    torneo.owner.request,
    torneo.id,
    partido.roundId,
    [{ matchId: partido.id, date: api.inDays(api.DEFAULT_START_IN_DAYS + 5), startsAt: '19:00', venue: '2' }],
    partido.id,
  );

  const guardado = (await ids.matchesOf(torneo.id)).find((fila) => fila.id === partido.id);
  expect(guardado).toMatchObject({ startsAt: '19:00:00', venue: '2' });
  expect(guardado?.matchDate).toBe(api.inDays(api.DEFAULT_START_IN_DAYS + 5));

  // El equipo local se entera de que se movio su partido.
  const local = torneo.teams.find((equipo) => equipo.name === partido.homeTeam);
  await mail.waitForMail({ to: local!.captain.email, subject: torneo.name });
});

test('una cancha ya ocupada a esa hora deja de ofrecerse', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const partidos = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id));
  const [primero, segundo] = partidos;
  const dia = api.inDays(api.DEFAULT_START_IN_DAYS + 5);

  await api.saveSchedule(
    torneo.owner.request,
    torneo.id,
    primero!.roundId,
    [{ matchId: primero!.id, date: dia, startsAt: '19:00', venue: '1' }],
    primero!.id,
  );

  const libres = await api.availableVenues(torneo.owner.request, torneo.id, {
    date: dia,
    startsAt: '19:00',
    matchId: segundo!.id,
  });

  expect(libres).not.toContain('1');
  expect(libres.length).toBeGreaterThan(0);
});

test('dos partidos no pueden compartir dia, hora y cancha', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const partidos = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id));
  const [primero, segundo] = partidos;
  const dia = api.inDays(api.DEFAULT_START_IN_DAYS + 5);

  await api.saveSchedule(
    torneo.owner.request,
    torneo.id,
    primero!.roundId,
    [{ matchId: primero!.id, date: dia, startsAt: '19:00', venue: '1' }],
    primero!.id,
  );

  const errores = await api.submitExpectingRejection(
    torneo.owner.request,
    `/torneos/${torneo.id}/gestion/agenda`,
    {
      roundId: segundo!.roundId,
      matchId: segundo!.id,
      'matches[0].matchId': segundo!.id,
      'matches[0].date': dia,
      'matches[0].startsAt': '19:00',
      'matches[0].venue': '1',
    },
  );

  expect(errores.length).toBeGreaterThan(0);
});

test('no se puede agendar un partido antes del inicio del torneo', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const partido = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id))[0]!;

  const errores = await api.submitExpectingRejection(
    torneo.owner.request,
    `/torneos/${torneo.id}/gestion/agenda`,
    {
      roundId: partido.roundId,
      matchId: partido.id,
      'matches[0].matchId': partido.id,
      'matches[0].date': api.inDays(api.DEFAULT_START_IN_DAYS - 5),
      'matches[0].startsAt': '19:00',
      'matches[0].venue': '2',
    },
  );

  expect(errores.length).toBeGreaterThan(0);
});

test('un partido puede quedar a confirmar, sin dia ni hora', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const partido = scenarios.playableMatches(await ids.currentRoundMatches(torneo.id))[0]!;

  await api.saveSchedule(
    torneo.owner.request,
    torneo.id,
    partido.roundId,
    [{ matchId: partido.id, venue: '2' }],
    partido.id,
  );

  const guardado = (await ids.matchesOf(torneo.id)).find((fila) => fila.id === partido.id);
  expect(guardado?.matchDate).toBeNull();
  expect(guardado?.venue).toBe('2');
});

test('no se puede rearmar el calendario de un torneo que ya lo tiene', async ({ scenario }) => {
  // El boton existe para los torneos viejos, creados antes de que el calendario
  // se armara solo. Sobre uno nuevo el service lo rechaza.
  const torneo = await scenario.draft();

  const respuesta = await api.post(
    torneo.owner.request,
    `/torneos/${torneo.id}/gestion/calendario`,
  );

  expect(respuesta.status()).toBe(400);
});

test('el organizador agenda una fecha entera desde la pantalla', async ({ scenario }) => {
  const torneo = await scenario.inProgress({ teams: 4 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id, { tab: 'partidos' });
  await management.openTab('partidos');

  const filas = await management.scheduleRows.count();
  for (let fila = 0; fila < filas; fila++) {
    await management.fillScheduleRow(fila, {
      date: api.inDays(api.DEFAULT_START_IN_DAYS + 6),
      startsAt: `${14 + fila}:00`,
      venue: String((fila % 3) + 1),
    });
  }
  await management.saveWholeRound();

  const agendados = (await ids.currentRoundMatches(torneo.id)).filter(
    (partido) => partido.matchDate === api.inDays(api.DEFAULT_START_IN_DAYS + 6),
  );
  expect(agendados.length).toBe(filas);
});
