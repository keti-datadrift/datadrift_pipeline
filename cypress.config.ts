import fs from 'fs';
import path from 'path';
import { defineConfig } from 'cypress';

const envFilePath = path.resolve(process.cwd(), 'cypress', 'cypress.env.json');
const envFromFile = fs.existsSync(envFilePath)
  ? JSON.parse(fs.readFileSync(envFilePath, 'utf-8'))
  : {};

export default defineConfig({
  video: false,
  screenshotsFolder: 'cypress/screenshots',
  videosFolder: 'cypress/videos',
  downloadsFolder: 'cypress/downloads',
  env: envFromFile,
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(on, config) {
      // place to register node event handlers when needed
      return config;
    },
  },
});
