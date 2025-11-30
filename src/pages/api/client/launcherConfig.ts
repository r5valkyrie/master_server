import type { APIRoute } from 'astro';
import { getLauncherConfig } from '../../../lib/launcherConfig.ts';
import { logger } from '../../../lib/logger.ts';

/**
 * Public API endpoint for launcher configuration
 * GET /api/client/launcherConfig
 * Returns the launcher config JSON that the launcher client needs
 */
export const GET: APIRoute = async ({ request }) => {
    try {
        const config = await getLauncherConfig();
        
        if (!config) {
            logger.error('Failed to retrieve launcher config', { prefix: 'LAUNCHER_API' });
            return new Response(
                JSON.stringify({ error: 'Failed to retrieve configuration' }),
                { 
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        return new Response(
            JSON.stringify(config),
            { 
                status: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
                }
            }
        );
    } catch (err) {
        logger.error(`Launcher config API error: ${err}`, { prefix: 'LAUNCHER_API' });
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
};

