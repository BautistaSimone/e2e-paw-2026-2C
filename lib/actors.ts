/**
 * Actores: un usuario de la app con sus dos caras, la de API y la de browser.
 *
 * Por que existe esto en vez de loguearse dos veces:
 *
 *   WebAuthConfig configura `.maximumSessions(1)`. Si un test arma el escenario
 *   por API como Ana y despues abre el browser logueandose otra vez como Ana,
 *   el segundo login **expira el primero** y el contexto de API queda muerto a
 *   mitad del test, con un error que no se parece en nada a la causa.
 *
 * La solucion es que cada actor se autentique **una sola vez** y que su sesion
 * se reparta: el `storageState` del contexto de API (donde vive el JSESSIONID)
 * se le pasa al contexto del browser. Misma cookie, misma sesion, cero
 * desalojos.
 *
 * Un actor se crea registrandose, no logueandose: la app no trae usuarios
 * sembrados y `AuthController#register` ya deja autenticado.
 */
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
  PlaywrightWorkerArgs,
} from '@playwright/test';


import * as auth from './api/auth';
import { TEST_PASSWORD, baseUrl } from './config';
import { promoteToAdmin } from './db';
import { userIdByEmail } from './ids';

/**
 * Lo unico que hace falta para crear contextos de API. Lo cumplen tanto el
 * objeto `playwright` que inyectan las fixtures como el `request` que exporta
 * @playwright/test, que es lo que usan los scripts sueltos (`npm run seed`).
 */
type RequestFactory = Pick<PlaywrightWorkerArgs['playwright'], 'request'>;

export interface Actor {
  email: string;
  password: string;
  /** Id en `users`. Hace falta para armar planillas y abrir su perfil. */
  id: number;
  /** Contexto autenticado para hablar por HTTP. */
  request: APIRequestContext;
  /** Pestaña del browser con la MISMA sesion. Se crea la primera vez que se pide. */
  page(): Promise<Page>;
}

export interface ActorOptions {
  /**
   * Locale del actor. Viaja como Accept-Language, que es lo unico que mira la
   * app: no hay LocaleResolver ni `?lang=`. Se guarda en `users.locale` al
   * registrarse y es el que se usa para mandarle mails.
   */
  locale?: string;
}

export interface ActorFactory {
  /** Crea la cuenta y devuelve el actor ya autenticado. */
  register(prefix: string, options?: ActorOptions): Promise<Actor>;
  /** Igual, pero ademas lo asciende a ADMIN. */
  admin(prefix: string, options?: ActorOptions): Promise<Actor>;
  /** Un contexto sin sesion, para los flujos publicos y los tests de login. */
  anonymous(options?: ActorOptions): Promise<APIRequestContext>;
}

/**
 * Arma la factory y devuelve tambien el `dispose` que hay que correr al final.
 *
 * El `browser` es opcional: los scripts que solo siembran datos por HTTP no
 * abren ninguna pestaña, y pedirles un browser seria hacerles levantar Chromium
 * para nada. Si falta, `actor.page()` lo dice en vez de fallar con un undefined.
 */
export function createActorFactory(
  playwright: RequestFactory,
  browser?: Browser,
): { actors: ActorFactory; dispose: () => Promise<void> } {
  const apiContexts: APIRequestContext[] = [];
  const browserContexts: BrowserContext[] = [];

  const newRequest = async (locale?: string): Promise<APIRequestContext> => {
    const context = await playwright.request.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: locale ? { 'Accept-Language': locale } : {},
    });
    apiContexts.push(context);
    return context;
  };

  const build = async (email: string, request: APIRequestContext, locale?: string): Promise<Actor> => {
    let cached: Page | undefined;
    return {
      email,
      password: TEST_PASSWORD,
      id: await userIdByEmail(email),
      request,
      async page(): Promise<Page> {
        if (cached) return cached;
        if (!browser) {
          throw new Error(
            'Este actor se creo sin browser, asi que no puede abrir una pestaña.\n' +
              'Pasale el browser a createActorFactory (las fixtures ya lo hacen).',
          );
        }
        const context = await browser.newContext({
          // La sesion sale del contexto de API: no hay un segundo login.
          storageState: await request.storageState(),
          locale,
        });
        browserContexts.push(context);
        cached = await context.newPage();
        return cached;
      },
    };
  };

  const actors: ActorFactory = {
    async register(prefix, { locale } = {}) {
      const request = await newRequest(locale);
      const { email } = await auth.registerNew(request, prefix);
      return build(email, request, locale);
    },

    async admin(prefix, options = {}) {
      const actor = await actors.register(prefix, options);
      await promoteToAdmin(actor.email);
      // El rol viaja en el UserDetails que se cargo al autenticar, asi que hay
      // que volver a loguearse para que la sesion lo vea.
      await auth.login(actor.request, { email: actor.email, password: actor.password });
      return actor;
    },

    anonymous: ({ locale } = {}) => newRequest(locale),
  };

  const dispose = async (): Promise<void> => {
    await Promise.all(browserContexts.map((context) => context.close()));
    await Promise.all(apiContexts.map((context) => context.dispose()));
  };

  return { actors, dispose };
}
