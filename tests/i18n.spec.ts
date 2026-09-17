/**
 * Internacionalizacion.
 *
 * La app elige el idioma **solo por `Accept-Language`**: no hay LocaleResolver
 * ni `?lang=`, asi que la unica forma de cambiarlo es pedir la pagina como un
 * browser configurado en ingles. Eso es lo que hace `test.use({ locale })`.
 *
 * El caso que mas facil se rompe es el ultimo: los mails tienen que salir en el
 * idioma **del que los recibe**, no en el del que disparo la accion. Es la
 * trampa clasica de leer `LocaleContextHolder` dentro de un envio async, que
 * toma el locale del request que quedo en ese thread.
 */
import { expect, test, api, ids, pagesOf } from '../fixtures';

test.describe('con el browser en ingles', () => {
  test.use({ locale: 'en-US' });

  test('la cartelera sale en ingles', async ({ page, discoverPage }) => {
    await discoverPage.goto();

    await expect(page.getByRole('heading', { name: 'The pitch is waiting for you' })).toBeVisible();
  });

  test('el login sale en ingles', async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.title).toHaveText('Log in to Fuchibol');
  });

  test('los errores de validacion tambien estan traducidos', async ({ registerPage }) => {
    await registerPage.goto();
    await registerPage.register(`corta.${Date.now()}@fuchibol.test`, 'corta');

    await expect(registerPage.errors.first()).toHaveText(
      'The password must be between 8 and 72 characters.',
    );
  });
});

// BUG CONOCIDO, no es una falla de la suite.
//
// La app le contesta en INGLES a un browser que pide castellano. La cadena es:
//   1. `WebConfig.messageSource()` es un ResourceBundleMessageSource sin tocar
//      `setFallbackToSystemLocale`, que viene en `true`;
//   2. el castellano vive en `messages.properties` (sin sufijo) y no existe
//      ningun `messages_es.properties`;
//   3. entonces, ante un `Accept-Language: es`, Java no encuentra
//      `messages_es`, cae al locale del sistema y encuentra `messages_en`.
//
// O sea que el idioma que ve el usuario depende del locale del SERVIDOR: en una
// maquina con el JVM en en_US (como esta) todos ven ingles. Se arregla con
// `messageSource.setFallbackToSystemLocale(false)`, o renombrando el bundle a
// `messages_es.properties`, pero es codigo de la app y una decision del equipo.
//
// El test queda escrito con el comportamiento esperado y marcado como fixme:
// cuando se arregle, se le saca el `.fixme` y tiene que pasar.
test.fixme('el castellano es el idioma por defecto', async ({ page, discoverPage }) => {
  await discoverPage.goto();

  await expect(page.getByRole('heading', { name: 'La cancha te está esperando' })).toBeVisible();
});

test('el mail sale en el idioma del que lo recibe, no en el del que lo dispara', async ({
  actors,
  scenario,
  mail,
}) => {
  // El organizador tiene la cuenta en castellano; el capitan, en ingles.
  const organizador = await actors.register('organizador', { locale: 'es-AR' });
  const capitan = await actors.register('capitan', { locale: 'en-US' });
  const torneo = await scenario.open({ owner: organizador, name: 'Copa Bilingue' });

  // La accion la dispara el capitan (en ingles) pero el mail va al organizador.
  const { tournament } = await pagesOf(capitan);
  await tournament.goto(torneo.id);
  await tournament.join('Los Bilingues');

  const aviso = await mail.waitForMail({ to: organizador.email, subject: 'Los Bilingues' });

  // "se anoto en", no "signed up for": manda el locale guardado del destinatario.
  expect(aviso.Subject).toContain('se anot');
  expect(aviso.Subject).not.toContain('signed up for');
});

test('al capitan en ingles le llega el mail en ingles', async ({ actors, scenario, mail }) => {
  const organizador = await actors.register('organizador', { locale: 'es-AR' });
  const capitan = await actors.register('capitan', { locale: 'en-US' });
  const torneo = await scenario.open({ owner: organizador, name: 'Copa Bilingue' });

  const { tournament } = await pagesOf(capitan);
  await tournament.goto(torneo.id);
  await tournament.join('Los Bilingues');

  // El organizador acepta: ahora el destinatario es el capitan, en ingles.
  const inscripcion = (await ids.registrationsOf(torneo.id))[0]!;
  await api.resolveRegistration(organizador.request, torneo.id, inscripcion.id, 'ACTIVE');

  const aviso = await mail.waitForMail({ to: capitan.email, subject: torneo.name });

  expect(aviso.Subject).toContain('Your team is in');
});
