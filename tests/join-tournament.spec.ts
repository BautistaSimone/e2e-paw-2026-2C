/**
 * Anotarse a un torneo y darse de baja.
 *
 * Es el flujo que mas cambio desde el sprint 1: el capitan ya no es un mail que
 * se tipea, es el usuario logueado, y el plantel se carga con chips que crean
 * cuentas PENDING para los que todavia no se registraron.
 */
import { expect, test, api, ids, pagesOf } from '../fixtures';

test('un capitan se anota con su plantel y le avisa al organizador', async ({
  actors,
  scenario,
  mail,
}) => {
  const torneo = await scenario.open({ name: 'Copa Con Plantel' });
  const capitan = await actors.register('capitan');
  const { tournament } = await pagesOf(capitan);

  await tournament.goto(torneo.id);
  await tournament.join('Los Cebollitas', ['pepe@fuchibol.test', 'juan@fuchibol.test']);

  await expect(tournament.flash.ok).toBeVisible();

  const inscripciones = await ids.registrationsOf(torneo.id);
  expect(inscripciones).toHaveLength(1);
  expect(inscripciones[0]).toMatchObject({ teamName: 'Los Cebollitas', status: 'PENDING' });

  // El capitan tambien juega, asi que el plantel son tres.
  const plantel = await ids.rosterOf(inscripciones[0]!.teamId);
  expect(plantel.map((jugador) => jugador.email).sort()).toEqual(
    ['juan@fuchibol.test', 'pepe@fuchibol.test', capitan.email].sort(),
  );
  // Los companeros quedan como cuentas a reclamar, sin password.
  expect(plantel.find((jugador) => jugador.email === 'pepe@fuchibol.test')?.status).toBe('PENDING');

  const aviso = await mail.waitForMail({ to: torneo.owner.email, subject: 'Los Cebollitas' });
  expect(aviso.Subject).toContain(torneo.name);
});

test('se puede anotar un equipo sin cargar el plantel', async ({ actors, scenario }) => {
  const torneo = await scenario.open({ name: 'Copa Sin Plantel' });
  const capitan = await actors.register('capitan');
  const { tournament } = await pagesOf(capitan);

  await tournament.goto(torneo.id);
  await tournament.join('Los Solitarios');

  const inscripciones = await ids.registrationsOf(torneo.id);
  expect(inscripciones).toHaveLength(1);
  // Solo el capitan.
  expect(await ids.rosterOf(inscripciones[0]!.teamId)).toHaveLength(1);
});

test('el editor de plantel rechaza un mail invalido sin ir al servidor', async ({
  actors,
  scenario,
}) => {
  const torneo = await scenario.open();
  const capitan = await actors.register('capitan');
  const { tournament } = await pagesOf(capitan);

  await tournament.goto(torneo.id);
  await tournament.joinButton.click();
  await tournament.addPlayer('esto-no-es-un-mail');

  await expect(tournament.rosterError).not.toBeEmpty();
  await expect(tournament.rosterChips).toHaveCount(0);
});

test('el editor de plantel no deja repetir al propio capitan', async ({ actors, scenario }) => {
  const torneo = await scenario.open();
  const capitan = await actors.register('capitan');
  const { tournament } = await pagesOf(capitan);

  await tournament.goto(torneo.id);
  await tournament.joinButton.click();
  await tournament.addPlayer(capitan.email);

  await expect(tournament.rosterError).not.toBeEmpty();
  await expect(tournament.rosterChips).toHaveCount(0);
});

test('el servidor rechaza un plantel mas grande que el maximo', async ({ actors, scenario }) => {
  // El limite es 14 companeros (15 con el capitan). Se prueba por HTTP porque
  // el editor lo frena antes en el browser: lo que se verifica aca es que el
  // servidor tambien lo frene, que es lo que importa.
  const torneo = await scenario.open();
  const capitan = await actors.register('capitan');
  const demasiados = Array.from({ length: 15 }, (_, i) => `jugador${i}@fuchibol.test`);

  const errores = await api.joinExpectingRejection(
    capitan.request,
    torneo.id,
    'Los Numerosos',
    { players: demasiados },
  );

  expect(errores.length).toBeGreaterThan(0);
  expect(await ids.registrationsOf(torneo.id)).toHaveLength(0);
});

test('no se puede anotar dos veces al mismo torneo', async ({ actors, scenario }) => {
  const torneo = await scenario.open();
  const capitan = await actors.register('capitan');
  await api.joinTournament(capitan.request, torneo.id, 'Primer Equipo');

  const errores = await api.joinExpectingRejection(capitan.request, torneo.id, 'Segundo Equipo');

  expect(errores.length).toBeGreaterThan(0);
  expect(await ids.registrationsOf(torneo.id)).toHaveLength(1);
});

test('con el cupo lleno el boton queda apagado y explica por que', async ({
  actors,
  scenario,
}) => {
  const torneo = await scenario.readyToStart({ teams: 2, maxTeams: 2 });
  const tarde = await actors.register('llego-tarde');
  const { tournament } = await pagesOf(tarde);

  await tournament.goto(torneo.id);

  await expect(tournament.joinButton).toBeDisabled();
  await expect(tournament.fullNotice).toBeVisible();
});

test('darse de baja libera el lugar y le avisa al organizador', async ({ scenario, mail }) => {
  const torneo = await scenario.withPendingTeams({ teams: 2 });
  const equipo = torneo.teams[0]!;
  const { tournament } = await pagesOf(equipo.captain);

  await tournament.goto(torneo.id);
  await tournament.leave();

  await expect(tournament.flash.ok).toBeVisible();

  const inscripcion = (await ids.registrationsOf(torneo.id)).find(
    (fila) => fila.teamName === equipo.name,
  );
  expect(inscripcion?.status).toBe('WITHDRAWN');

  await mail.waitForMail({ to: torneo.owner.email, subject: equipo.name });
});
