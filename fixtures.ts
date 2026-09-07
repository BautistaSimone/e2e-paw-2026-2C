/**
 * Fixtures propias: cablean las capas para que un test arranque en dos lineas.
 *
 * Los tests importan `test` y `expect` de aca, no de @playwright/test.
 */
import { test as base, expect } from '@playwright/test';

import * as api from './lib/api';
import { organizerEmail } from './lib/config';
import { resetDatabase } from './lib/db';
import * as ids from './lib/ids';
import * as mail from './lib/mail';
import * as scenarios from './scenarios';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentManagementPage } from './pages/TournamentManagementPage';

/** Escenarios con el request context ya inyectado. */
export interface ScenarioFixture {
  draft: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  open: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  withPendingTeams: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  readyToStart: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  inProgress: (
    options?: scenarios.ScenarioOptions & { round?: number },
  ) => Promise<scenarios.TournamentRef>;
  finished: (options?: scenarios.ScenarioOptions) => Promise<scenarios.TournamentRef>;
  playCurrentRound: (tournamentId: number) => Promise<ids.MatchRow[]>;
}

interface Fixtures {
  scenario: ScenarioFixture;
  mail: typeof mail;
  /** Mail del organizador: a esa casilla avisa la app cada inscripcion. */
  organizer: string;
  discoverPage: DiscoverPage;
  tournamentPage: TournamentDetailPage;
  adminPage: AdminPanelPage;
  managementPage: TournamentManagementPage;
}

export const test = base.extend<Fixtures>({
  // Base y casilla limpias antes de cada test: ninguno depende de que corrio
  // antes ni deja basura para el que sigue.
  page: async ({ page }, use) => {
    await resetDatabase();
    await mail.deleteAllMail();
    await use(page);
  },

  scenario: async ({ request }, use) => {
    await use({
      draft: (options) => scenarios.draftTournament(request, options),
      open: (options) => scenarios.openForRegistration(request, options),
      withPendingTeams: (options) => scenarios.withPendingTeams(request, options),
      readyToStart: (options) => scenarios.readyToStart(request, options),
      inProgress: (options) => scenarios.inProgress(request, options),
      finished: (options) => scenarios.finished(request, options),
      playCurrentRound: (tournamentId) => scenarios.playCurrentRound(request, tournamentId),
    });
  },

  mail: async ({}, use) => {
    await use(mail);
  },

  organizer: async ({}, use) => {
    await use(organizerEmail());
  },

  discoverPage: async ({ page }, use) => {
    await use(new DiscoverPage(page));
  },
  tournamentPage: async ({ page }, use) => {
    await use(new TournamentDetailPage(page));
  },
  adminPage: async ({ page }, use) => {
    await use(new AdminPanelPage(page));
  },
  managementPage: async ({ page }, use) => {
    await use(new TournamentManagementPage(page));
  },
});

export { expect, api, ids, scenarios };
