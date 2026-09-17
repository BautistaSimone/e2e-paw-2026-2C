/**
 * Registro, login, remember-me y sesiones.
 *
 * Es lo primero que se rompe si alguien toca `WebAuthConfig`, y es el cimiento
 * del resto de la suite: si esto no anda, ningun otro test puede ni empezar.
 */
import { expect, test, api, ids } from '../fixtures';
import { TEST_PASSWORD } from '../lib/config';

test('registrarse deja la sesion abierta y lleva a mis torneos', async ({
  page,
  registerPage,
  myTournamentsPage,
  header,
}) => {
  const email = api.auth.uniqueEmail('nuevo');

  await registerPage.goto();
  await registerPage.register(email, TEST_PASSWORD);

  await expect(page).toHaveURL(/\/mis-torneos/);
  await expect(myTournamentsPage.flash.ok).toBeVisible();
  await expect(header.logoutButton).toBeVisible();
  expect((await ids.userByEmail(email)).status).toBe('ACTIVE');
});

test('el registro rechaza una contraseña de menos de 8 caracteres', async ({
  page,
  registerPage,
}) => {
  await registerPage.goto();
  await registerPage.register(api.auth.uniqueEmail('corta'), 'corta');

  await expect(page).toHaveURL(/\/registro/);
  await expect(registerPage.errors.first()).toBeVisible();
});

test('el registro rechaza un email mal formado', async ({ page, registerPage }) => {
  await registerPage.goto();
  // Sin esto el browser frena el submit y la validacion del servidor, que es la
  // que se esta probando, nunca llega a correr.
  await registerPage.relaxEmailValidation();
  await registerPage.register('no-es-un-email', TEST_PASSWORD);

  await expect(page).toHaveURL(/\/registro/);
  await expect(registerPage.errors.first()).toBeVisible();
});

test('registrarse con un email ya usado no revela que la cuenta existe', async ({
  actors,
  page,
  registerPage,
}) => {
  const existente = await actors.register('repetido');

  await registerPage.goto();
  await registerPage.register(existente.email, TEST_PASSWORD);

  await expect(page).toHaveURL(/\/registro/);
  const mensaje = await registerPage.errors.first().textContent();
  // No puede decir "ese email ya esta registrado": seria confirmarle a
  // cualquiera que esa cuenta existe.
  expect(mensaje?.toLowerCase()).not.toContain(existente.email.toLowerCase());
});

test('se puede entrar con las credenciales correctas', async ({
  actors,
  page,
  loginPage,
  header,
}) => {
  const usuario = await actors.register('vuelve');

  await loginPage.goto();
  await loginPage.login(usuario.email, usuario.password);

  await expect(page).toHaveURL(/\/mis-torneos/);
  await expect(header.logoutButton).toBeVisible();
});

test('una contraseña incorrecta vuelve al login con el error', async ({
  actors,
  page,
  loginPage,
}) => {
  const usuario = await actors.register('mala-clave');

  await loginPage.goto();
  await loginPage.login(usuario.email, 'contraseña-que-no-es');

  await expect(page).toHaveURL(/\/login\?error/);
  await expect(loginPage.error).toBeVisible();
});

test('remember-me mantiene la sesion despues de perder la cookie de sesion', async ({
  actors,
  page,
  context,
  loginPage,
  header,
}) => {
  const usuario = await actors.register('recordado');

  await loginPage.goto();
  await loginPage.login(usuario.email, usuario.password, { rememberMe: true });
  await expect(header.logoutButton).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.map((cookie) => cookie.name)).toContain('remember-me');

  // Se tira la sesion del servidor y queda solo el token de remember-me: es lo
  // que pasa cuando se cierra el browser y se vuelve al otro dia.
  await context.addCookies([
    ...cookies
      .filter((cookie) => cookie.name === 'JSESSIONID')
      .map((cookie) => ({ ...cookie, value: 'invalidada' })),
  ]);
  await page.goto('/mis-torneos');

  await expect(page).toHaveURL(/\/mis-torneos/);
  await expect(header.logoutButton).toBeVisible();
});

test('cerrar sesion vuelve al inicio y deja de dar acceso a mis torneos', async ({
  actors,
  page,
  loginPage,
  header,
}) => {
  const usuario = await actors.register('se-va');
  await loginPage.goto();
  await loginPage.login(usuario.email, usuario.password);

  await header.logout();

  await expect(page).toHaveURL(/\/$/);
  await expect(header.loginLink).toBeVisible();

  await page.goto('/mis-torneos');
  await expect(page).toHaveURL(/\/login/);
});

test('entrar por segunda vez expira la sesion anterior', async ({ actors }) => {
  // La app permite una sola sesion por usuario (`maximumSessions(1)`), y la que
  // cae es la vieja: `maxSessionsPreventsLogin(false)`.
  const usuario = await actors.register('duplicado');
  const otraPestaña = await actors.anonymous();

  await api.auth.login(otraPestaña, { email: usuario.email, password: usuario.password });

  const respuesta = await usuario.request.get('/mis-torneos', { maxRedirects: 0 });
  expect(respuesta.headers()['location']).toContain('/login?expired');
});
