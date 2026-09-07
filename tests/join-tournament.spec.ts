/**
 * Inscribir un equipo desde la pantalla: el camino feliz, el aviso por mail al
 * organizador y el rechazo por mail repetido.
 */
import { ids, expect, test } from '../fixtures';

test('anotar un equipo lo deja inscripto y avisa al organizador', async ({
  scenario,
  tournamentPage,
  mail,
  organizer,
}) => {
  const tournament = await scenario.open({ name: 'Copa Inscripcion' });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.joinTeam('Los Cebollitas', 'capitan@fuchibol.test');

  const registrations = await ids.registrationsOf(tournament.id);
  expect(registrations).toHaveLength(1);
  expect(registrations[0]).toMatchObject({ teamName: 'Los Cebollitas', status: 'PENDING' });

  // El aviso es parte de la operacion: ningun flujo puede "olvidarse" de
  // notificar. Como el envio es async, se espera en vez de leer una vez.
  const aviso = await mail.waitForMail({ to: organizer, subject: 'Los Cebollitas' });
  expect(aviso.Subject).toContain(tournament.name);
});

test('el mail al organizador linkea al torneo', async ({
  scenario,
  tournamentPage,
  mail,
  organizer,
}) => {
  const tournament = await scenario.open({ name: 'Copa Links' });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.joinTeam('Los Galacticos', 'otro.capitan@fuchibol.test');

  const aviso = await mail.waitForMail({ to: organizer, subject: 'Los Galacticos' });

  // El link sale de app.base-url, nunca del Host del request.
  expect(mail.linksIn(aviso).some((link) => link.includes(`/torneos/${tournament.id}`))).toBe(true);
});

test('anotarse dos veces con el mismo mail se rechaza sin perder lo tipeado', async ({
  tournamentPage,
  scenario,
}) => {
  const tournament = await scenario.open({ name: 'Copa Repetida' });
  await tournamentPage.goto(tournament.id);
  await tournamentPage.joinTeam('Primer Equipo', 'repetido@fuchibol.test');

  await tournamentPage.joinTeam('Segundo Equipo', 'repetido@fuchibol.test');

  // El modal se reabre con el error pegado al campo...
  await expect(tournamentPage.joinDialog).toBeVisible();
  await expect(tournamentPage.fieldError('email-capitan')).toBeVisible();
  // ...y con lo que la persona habia escrito todavia ahi.
  await expect(tournamentPage.fieldValue('nombre-equipo')).toHaveValue('Segundo Equipo');
  await expect(tournamentPage.fieldValue('email-capitan')).toHaveValue('repetido@fuchibol.test');

  expect(await ids.registrationsOf(tournament.id)).toHaveLength(1);
});

test('no se puede anotar mas equipos que el cupo', async ({ scenario, tournamentPage }) => {
  const tournament = await scenario.withPendingTeams({ name: 'Copa Llena', teams: 4, maxTeams: 4 });

  await tournamentPage.goto(tournament.id);
  await tournamentPage.joinTeam('Equipo Tarde', 'tarde@fuchibol.test');

  await expect(tournamentPage.fieldError('nombre-equipo')).toBeVisible();
  expect(await ids.registrationsOf(tournament.id)).toHaveLength(4);
});
