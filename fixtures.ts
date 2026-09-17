/**
 * Fixtures propias: cablean las capas para que un test arranque en dos lineas.
 *
 * Los tests importan `test` y `expect` de aca, no de @playwright/test.
 *
 * El `page` que da Playwright sigue estando y es el del **visitante anonimo**:
 * sirve para todo lo publico y para los tests de login. Cuando un test necesita
 * mirar la app con los ojos de alguien logueado, no se loguea en ese `page` —
 * pide `actor.page()`, que reusa la sesion que el actor ya tiene. El motivo
 * esta explicado en `lib/actors.ts`: la app permite una sola sesion por
 * usuario y un segundo login expira el primero.
 */
import { test as base, expect } from '@playwright/test';

import * as api from './lib/api';
import { createActorFactory, type Actor, type ActorFactory } from './lib/actors';
import { resetDatabase } from './lib/db';
import * as ids from './lib/ids';
import * as mail from './lib/mail';
import * as scenarios from './scenarios';
import { LoginPage, RegisterPage, SiteHeader } from './pages/AuthPages';
import { DiscoverPage } from './pages/DiscoverPage';
import { MatchSheetPage } from './pages/MatchSheetPage';
import { MyTournamentsPage } from './pages/MyTournamentsPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentManagementPage } from './pages/TournamentManagementPage';

/** Escenarios con la factory de actores ya inyectada. */
export interface ScenarioFixture {
  draft: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  open: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  withPendingTeams: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  readyToStart: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  inProgress: (
    options?: scenarios.ScenarioOptions & { round?: number },
  ) => Promise<scenarios.TournamentRef>;
  finished: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  scheduled: (
    options?: scenarios.ScenarioOptions & { date?: string; startsAt?: string },
  ) => Promise<scenarios.TournamentRef>;
  withMatchSheet: (
    options?: scenarios.ScenarioOptions,
  ) => ReturnType<typeof scenarios.withMatchSheet>;
  playCurrentRound: (tournament: scenarios.TournamentRef) => Promise<ids.MatchRow[]>;
  acceptPendingTeams: (tournament: scenarios.TournamentRef) => Promise<ids.RegistrationRow[]>;
}

interface Fixtures {
  /**
   * Base y casilla limpias. Es `auto`, asi que corre en todos los tests sin
   * que haya que pedirla, y las demas fixtures la declaran como dependencia
   * para que el orden quede garantizado: si el reset corriera despues de que
   * un actor se registro, le borraria el usuario por debajo.
   */
  cleanState: void;
  /** Crea usuarios de la app. Cada uno trae su sesion de API y de browser. */
  actors: ActorFactory;
  scenario: ScenarioFixture;
  mail: typeof mail;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  header: SiteHeader;
  discoverPage: DiscoverPage;
  tournamentPage: TournamentDetailPage;
  myTournamentsPage: MyTournamentsPage;
  managementPage: TournamentManagementPage;
  sheetPage: MatchSheetPage;
  profilePage: PlayerProfilePage;
}

export const test = base.extend<Fixtures>({
  // Ninguno depende de que corrio antes ni deja basura para el que sigue.
  cleanState: [
    async ({}, use) => {
      await resetDatabase();
      await mail.deleteAllMail();
      await use();
    },
    { auto: true },
  ],

  actors: async ({ cleanState, playwright, browser }, use) => {
    const { actors, dispose } = createActorFactory(playwright, browser);
    await use(actors);
    await dispose();
  },

  scenario: async ({ actors }, use) => {
    await use({
      draft: (options) => scenarios.draftTournament(actors, options),
      open: (options) => scenarios.openForRegistration(actors, options),
      withPendingTeams: (options) => scenarios.withPendingTeams(actors, options),
      readyToStart: (options) => scenarios.readyToStart(actors, options),
      inProgress: (options) => scenarios.inProgress(actors, options),
      finished: (options) => scenarios.finished(actors, options),
      scheduled: (options) => scenarios.scheduled(actors, options),
      withMatchSheet: (options) => scenarios.withMatchSheet(actors, options),
      playCurrentRound: (tournament) => scenarios.playCurrentRound(tournament),
      acceptPendingTeams: (tournament) => scenarios.acceptPendingTeams(tournament),
    });
  },

  mail: async ({}, use) => {
    await use(mail);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  header: async ({ page }, use) => {
    await use(new SiteHeader(page));
  },
  discoverPage: async ({ page }, use) => {
    await use(new DiscoverPage(page));
  },
  tournamentPage: async ({ page }, use) => {
    await use(new TournamentDetailPage(page));
  },
  myTournamentsPage: async ({ page }, use) => {
    await use(new MyTournamentsPage(page));
  },
  managementPage: async ({ page }, use) => {
    await use(new TournamentManagementPage(page));
  },
  sheetPage: async ({ page }, use) => {
    await use(new MatchSheetPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new PlayerProfilePage(page));
  },
});

/**
 * Los page objects atados a la pestaña de un actor logueado. Es el equivalente
 * de las fixtures de arriba para cuando el test mira la app como alguien.
 */
export async function pagesOf(actor: Actor) {
  const page = await actor.page();
  return {
    page,
    header: new SiteHeader(page),
    discover: new DiscoverPage(page),
    tournament: new TournamentDetailPage(page),
    myTournaments: new MyTournamentsPage(page),
    management: new TournamentManagementPage(page),
    sheet: new MatchSheetPage(page),
    profile: new PlayerProfilePage(page),
  };
}

export { expect, api, ids, scenarios };
export type { Actor };
