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
          const { logger } = await import('./src/lib/logger.ts');
          logger.info('Initializing background tasks', { prefix: 'SERVER' });
          await initializeStartup();
        } catch (err) {
          console.error('[ERROR] Failed to initialize startup tasks:', err);
        }
      });
    },
    'astro:build:done': async () => {
      // For production builds, we'll initialize on first request via middleware
      // This ensures proper timing after database connection is established
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
    build: {
      assetsInlineLimit: 0, // Don't inline any assets, serve them as separate files
    },
    server: {
      // Allow hosts from environment variable (comma-separated) or all hosts if not specified
      allowedHosts: process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',').map(h => h.trim()) : undefined,
      fs: {
        // Restrict file serving to the project directory only
        strict: true,
        allow: ['.']
      }
    }
  },
  integrations: [startupIntegration]
});
