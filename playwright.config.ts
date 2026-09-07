import { defineConfig, devices } from '@playwright/test';

import { baseUrl } from './lib/config';
import { jettyCommand, mavenCwd } from './lib/maven';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',

  // La app tiene una sola base y los escenarios de distintos tests se pisarian.
  // Cuando cada test cree su torneo con nombre unico (ya lo hacen los
  // escenarios), esto se puede subir.
  fullyParallel: false,
  workers: 1,

  // Un `.only` olvidado no puede quedar tapando al resto de la suite.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: baseUrl,
    // Cuando algo falla, el trace tiene el DOM navegable paso a paso: con JSPs
    // y modales <dialog> vale mas que cualquier log.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: jettyCommand(),
    cwd: mavenCwd,
    url: baseUrl,
    reuseExistingServer: !process.env.CI,
    // Arranque en frio: Maven compila los 6 modulos antes de levantar Jetty.
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
