/**
 * Playwright configuration for recording demo videos (not run in CI).
 *
 *   jlpm playwright test -c playwright.videos.config.js
 *
 * Videos land in test-results/<test-name>/video.webm, subtitles next to the spec.
 * Uses its own port, so it never reuses a JupyterLab you are running on 8888.
 */
const baseConfig = require('./playwright.config');

const PORT = 8899;

module.exports = {
  ...baseConfig,
  testDir: './videos',
  timeout: 10 * 60 * 1000,
  retries: 0,
  webServer: {
    ...baseConfig.webServer,
    command: `jlpm start --ServerApp.port=${PORT}`,
    url: `http://localhost:${PORT}/lab`,
    reuseExistingServer: false
  },
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 30 * 1000,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } }
  }
};
