// @ts-check
import 'dotenv/config';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

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
  }
});
