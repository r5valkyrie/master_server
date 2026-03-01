import { logger } from '../../../lib/logger';
import type { APIRoute } from 'astro';

// Store application start time (this will be set when the module loads)
const APP_START_TIME = Date.now();

function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (remainingHours > 0) parts.push(`${remainingHours}h`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
}

export const GET: APIRoute = async () => {
  try {
    const currentTime = Date.now();
    const uptimeMs = currentTime - APP_START_TIME;
    
    const uptime = {
      startTime: APP_START_TIME,
      currentTime: currentTime,
      uptimeMs: uptimeMs,
      uptimeSeconds: Math.floor(uptimeMs / 1000),
      formatted: formatUptime(uptimeMs),
      status: 'online'
    };

    return new Response(JSON.stringify({ 
      success: true, 
      uptime 
    }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    logger.error(`Uptime API error: ${error}`, { prefix: 'ADMIN' });
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to get uptime' 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
