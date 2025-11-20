import type { APIRoute } from 'astro';
import { getPool, getAllDiscordConfig, setDiscordConfig } from '../../../lib/db';
import { logger } from '../../../lib/logger';

export const GET: APIRoute = async () => {
    try {
        const config = await getAllDiscordConfig();
        return new Response(JSON.stringify({ success: true, config }), { status: 200 });
    } catch (err) {
        logger.error(`Discord config GET error: ${err}`, { prefix: 'API' });
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const updates = body.updates as Array<{ key: string; value: string }> || [];

        if (!Array.isArray(updates) || updates.length === 0) {
            return new Response(JSON.stringify({ success: false, error: 'No updates provided' }), { status: 400 });
        }

        // Update each config value
        for (const update of updates) {
            const key = String(update.key || '').trim();
            const value = String(update.value || '').trim();
            
            if (!key) continue;
            
            const result = await setDiscordConfig(key, value);
            if (!result) {
                logger.warn(`Failed to update Discord config key: ${key}`, { prefix: 'API' });
            }
        }

        logger.info(`Updated ${updates.length} Discord config values`, { prefix: 'API' });
        return new Response(JSON.stringify({ success: true, updated: updates.length }), { status: 200 });
    } catch (err) {
        logger.error(`Discord config POST error: ${err}`, { prefix: 'API' });
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};
