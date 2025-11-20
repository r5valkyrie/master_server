// @ts-check
import 'dotenv/config';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Startup integration to initialize background tasks on server start
const startupIntegration = {
  name: 'startup-integration',
  hooks: {
    'astro:server:setup': async () => {
      // Schedule initialization for next tick to ensure everything is ready
      setImmediate(async () => {
        try {
          const { initializeStartup } = await import('./src/lib/startup.ts');
          await initializeStartup();
        } catch (err) {
          console.error('Failed to initialize startup tasks:', err);
        }
      });
    }
  }
};

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  server: {
    port: 3000,
    host: true
  },
  vite: {
    server: {
      // Allow hosts from environment variable (comma-separated) or all hosts if not specified
      allowedHosts: process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',').map(h => h.trim()) : undefined
    }
  },
  integrations: [startupIntegration]
});
