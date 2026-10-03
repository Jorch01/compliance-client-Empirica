/**
 * Browser tests of the portal with fictitious data (npm run test:e2e): the
 * mock build (the real backend code with simulated Google services) served
 * locally, driven by Chromium. Two browser contexts are two devices.
 *
 * CHROMIUM_PATH points at an installed Chromium when Playwright's own is not
 * downloaded (development containers); CI installs Playwright's.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // One mock backend for every test: they run one after another.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}/`,
    locale: 'es-MX',
    timezoneId: 'America/Cancun',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build:mock && npm run preview:mock -- --port ${String(PORT)} --strictPort`,
    cwd: '..',
    url: `http://localhost:${String(PORT)}/mock-api/instance`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
