/**
 * La consola del organizador: publicar, completar los datos, resolver
 * inscripciones y cancelar.
 *
 * Todo esto pasa por `/torneos/{id}/gestion`, que exige ser el dueño (o admin);
 * los permisos en si los cubre `access-control.spec.ts`.
 */
import { expect, test, api, ids, pagesOf } from '../fixtures';
import { pngFile } from '../lib/files';

test('publicar abre las inscripciones', async ({ scenario }) => {
  const torneo = await scenario.draft({ name: 'Copa Por Publicar' });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await expect(management.status).toHaveAttribute('data-tournament-status', 'DRAFT');

  await management.publish();

  await expect(management.status).toHaveAttribute('data-tournament-status', 'REGISTRATION_OPEN');
  expect(await ids.tournamentStatus(torneo.id)).toBe('REGISTRATION_OPEN');
});

test('el boton de iniciar esta apagado y dice por que, mientras falten equipos', async ({
  scenario,
}) => {
  const torneo = await scenario.open({ name: 'Copa Sin Equipos' });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);

  await expect(management.startButton).toBeDisabled();
  await expect(management.startHelp).toBeVisible();
});

test('quedan inscripciones pendientes: tampoco se puede iniciar', async ({ scenario }) => {
  const torneo = await scenario.withPendingTeams({ teams: 4 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);

  await expect(management.startButton).toBeDisabled();
  await expect(management.startHelp).toBeVisible();
});

test('los datos y la portada se guardan en un solo submit', async ({ scenario }) => {
  const torneo = await scenario.open({ name: 'Copa Por Completar' });
  const { page, management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.openTab('datos');
  // El boton nace apagado: sin un cambio real no hay nada que guardar.
  await expect(management.saveDataButton).toBeDisabled();

  await management.saveData(
    {
      name: 'Copa Ya Completa',
      description: 'Un torneo de prueba',
      rules: 'Se juega con pelota numero 5.',
      location: 'Cancha Central',
    },
    pngFile(),
  );

  await expect(management.dataField('name')).toHaveValue('Copa Ya Completa');
  await expect(management.dataField('rules')).toHaveValue('Se juega con pelota numero 5.');

  // La portada queda servida en su propio endpoint, con su tipo real.
  const portada = await page.request.get(`/torneos/${torneo.id}/portada`);
  expect(portada.status()).toBe(200);
  expect(portada.headers()['content-type']).toContain('image/png');
});

test('aceptar una inscripcion se la avisa al capitan', async ({ scenario, mail }) => {
  const torneo = await scenario.withPendingTeams({ teams: 2 });
  const equipo = torneo.teams[0]!;
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.resolveRegistration(equipo.name, 'ACTIVE');

  const inscripcion = (await ids.registrationsOf(torneo.id)).find(
    (fila) => fila.teamName === equipo.name,
  );
  expect(inscripcion?.status).toBe('ACTIVE');

  await mail.waitForMail({ to: equipo.captain.email, subject: torneo.name });
});

test('rechazar una inscripcion tambien se avisa', async ({ scenario, mail }) => {
  const torneo = await scenario.withPendingTeams({ teams: 2 });
  const equipo = torneo.teams[1]!;
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.resolveRegistration(equipo.name, 'REJECTED');

  const inscripcion = (await ids.registrationsOf(torneo.id)).find(
    (fila) => fila.teamName === equipo.name,
  );
  expect(inscripcion?.status).toBe('REJECTED');

  await mail.waitForMail({ to: equipo.captain.email, subject: torneo.name });
});

test('dar de baja un equipo ya aceptado pide confirmacion', async ({ scenario }) => {
  const torneo = await scenario.readyToStart({ teams: 2 });
  const equipo = torneo.teams[0]!;
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.resolveRegistration(equipo.name, 'WITHDRAWN');

  const inscripcion = (await ids.registrationsOf(torneo.id)).find(
    (fila) => fila.teamName === equipo.name,
  );
  expect(inscripcion?.status).toBe('WITHDRAWN');
});

test('no se puede aceptar mas equipos que el cupo', async ({ scenario }) => {
  // Anotarse con el cupo lleno si se puede: lo que frena es aceptar.
  const torneo = await scenario.withPendingTeams({ teams: 3, maxTeams: 2 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.resolveRegistration(torneo.teams[0]!.name, 'ACTIVE');
  await management.resolveRegistration(torneo.teams[1]!.name, 'ACTIVE');
  await management.resolveRegistration(torneo.teams[2]!.name, 'ACTIVE');

  await expect(management.flash.error).toBeVisible();
  const activos = (await ids.registrationsOf(torneo.id)).filter(
    (fila) => fila.status === 'ACTIVE',
  );
  expect(activos).toHaveLength(2);
});

test('la tarjeta de cada equipo muestra su plantel con link al perfil', async ({ scenario }) => {
  const torneo = await scenario.withPendingTeams({ teams: 2, playersPerTeam: 2 });
  const equipo = torneo.teams[0]!;
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.openTab('equipos');

  // El capitan mas los dos que cargo.
  await expect(management.roster(equipo.name)).toHaveCount(3);
  await expect(management.rosterLinks(equipo.name).first()).toHaveAttribute(
    'href',
    /\/jugadores\/\d+/,
  );
});

test('un equipo sin plantel lo dice en vez de mostrar una lista vacia', async ({ scenario }) => {
  const torneo = await scenario.withPendingTeams({ teams: 1 });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.openTab('equipos');

  // Solo esta el capitan: no hay companeros cargados.
  await expect(management.roster(torneo.teams[0]!.name)).toHaveCount(1);
});

test('el organizador puede sumar un equipo que se anoto por afuera', async ({ scenario }) => {
  const torneo = await scenario.open({ name: 'Copa Con Anotados A Mano' });
  const { management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.addTeam('Los Del Barrio', 'capitan.offline@fuchibol.test');

  const inscripciones = await ids.registrationsOf(torneo.id);
  expect(inscripciones.map((fila) => fila.teamName)).toContain('Los Del Barrio');
  // La cuenta del capitan se creo sola, a la espera de que la reclame.
  expect((await ids.userByEmail('capitan.offline@fuchibol.test')).status).toBe('PENDING');
});

test('cancelar exige un motivo y avisa a todos los capitanes', async ({ scenario, mail }) => {
  const torneo = await scenario.readyToStart({ teams: 2, name: 'Copa Cancelada' });
  const { page, management } = await pagesOf(torneo.owner);

  await management.goto(torneo.id);
  await management.cancel('Se inundo la cancha');

  await expect(page).toHaveURL(/\/mis-torneos/);
  expect(await ids.tournamentStatus(torneo.id)).toBe('CANCELLED');

  for (const equipo of torneo.teams) {
    await mail.waitForMail({ to: equipo.captain.email, subject: torneo.name });
  }
});

test('cancelar sin motivo no cancela nada', async ({ scenario }) => {
  const torneo = await scenario.readyToStart({ teams: 2 });

  const errores = await api.submitExpectingRejection(
    torneo.owner.request,
    `/torneos/${torneo.id}/gestion/cancelar`,
    { reason: '' },
  );

  expect(errores.length).toBeGreaterThan(0);
  expect(await ids.tournamentStatus(torneo.id)).toBe('REGISTRATION_OPEN');
});
