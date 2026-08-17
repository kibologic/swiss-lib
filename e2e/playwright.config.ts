/*
 * CROSS-001-B: Playwright config driving all three browser engines from one API
 * (Blink via chromium, WebKit, Gecko via firefox) -- per FABLE-CROSS-001 s8, the only
 * option that does this without per-minute vendor billing. See DRR in the PR body.
 *
 * IMPORTANT (never_touch, task spec): Playwright's "webkit" project is WebKit the
 * ENGINE, not iOS Safari. It does not reproduce the dynamic toolbar, the home
 * indicator, or iOS input-focus behaviour -- the surface where FABLE-CROSS-001 §5
 * identified the platform's highest risk. This harness catches Blink/WebKit/Gecko
 * DIVERGENCE; it is not a substitute for real-device verification pre-release.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 4173;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node server/static-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/fixtures/ssr-counter.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium', // Blink -- Chrome, Edge, Chrome Android, Android WebView
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit', // WebKit engine -- NOT iOS Safari, see header note
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'firefox', // Gecko
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
