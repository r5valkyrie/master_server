import type { APIRoute } from 'astro';
import {
    getLauncherConfigValue,
    setLauncherConfigValue,
    getAllLauncherChannels,
    getLauncherChannel,
    createLauncherChannel,
    updateLauncherChannel,
    deleteLauncherChannel,
    reorderLauncherChannels
} from '../../../lib/launcherConfig.ts';
import { logger } from '../../../lib/logger.ts';
import { validateString } from '../../../lib/input-validation';

// Allowlist of valid launcher config keys — prevents arbitrary key injection
const ALLOWED_CONFIG_KEYS = new Set([
    'backgroundVideo', 'launcherVersion', 'updateUrl', 'newsUrl',
    'patchNotesUrl', 'supportUrl', 'discordInviteUrl',
]);

/**
 * Admin API endpoint for managing launcher configuration
 * GET: Get all config values and channels
 * POST: Create new channel
 * PUT: Update config value or channel
 * DELETE: Delete a channel
 */

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        const id = url.searchParams.get('id');

        if (action === 'channel' && id) {
            // Get a specific channel
            const channel = await getLauncherChannel(parseInt(id));
            if (!channel) {
                return new Response(
                    JSON.stringify({ error: 'Channel not found' }),
                    { status: 404, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response(
                JSON.stringify(channel),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Get all config and channels
        const backgroundVideo = await getLauncherConfigValue('backgroundVideo');
        const channels = await getAllLauncherChannels();

        return new Response(
            JSON.stringify({
                config: {
                    backgroundVideo: backgroundVideo || 'shortshowcr5v.mp4'
                },
                channels
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        logger.error(`Admin launcher config GET error: ${err}`, { prefix: 'ADMIN_API' });
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const action = body.action;

        if (action === 'createChannel') {
            const { name, game_url, dedi_url, enabled, requires_key, allow_updates } = body;
            
            if (!name || !game_url || !dedi_url) {
                return new Response(
                    JSON.stringify({ error: 'Missing required fields' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const success = await createLauncherChannel({
                name,
                game_url,
                dedi_url,
                enabled,
                requires_key,
                allow_updates
            });

            if (!success) {
                return new Response(
                    JSON.stringify({ error: 'Failed to create channel' }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }

            logger.info(`Created launcher channel: ${name}`, { prefix: 'ADMIN_API' });
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        logger.error(`Admin launcher config POST error: ${err}`, { prefix: 'ADMIN_API' });
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const PUT: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const action = body.action;

        if (action === 'updateConfig') {
            const { key, value } = body;
            
            if (!key || value === undefined) {
                return new Response(
                    JSON.stringify({ error: 'Missing key or value' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Enforce config key allowlist
            if (!ALLOWED_CONFIG_KEYS.has(key)) {
                logger.warn(`Rejected unknown launcher config key: ${key}`, { prefix: 'ADMIN_API' });
                return new Response(
                    JSON.stringify({ error: 'Invalid config key' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Validate value length
            const valCheck = validateString(String(value), 0, 2000);
            if (!valCheck.valid) {
                return new Response(
                    JSON.stringify({ error: `Invalid value: ${valCheck.error}` }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const success = await setLauncherConfigValue(key, value);
            
            if (!success) {
                return new Response(
                    JSON.stringify({ error: 'Failed to update config' }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }

            logger.info(`Updated launcher config: ${key}=${value}`, { prefix: 'ADMIN_API' });
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'updateChannel') {
            const { id, ...updateData } = body;
            
            if (!id) {
                return new Response(
                    JSON.stringify({ error: 'Missing channel ID' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const success = await updateLauncherChannel(id, updateData);
            
            if (!success) {
                return new Response(
                    JSON.stringify({ error: 'Failed to update channel' }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }

            logger.info(`Updated launcher channel ID ${id}`, { prefix: 'ADMIN_API' });
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'reorderChannels') {
            const { channelIds } = body;
            
            if (!Array.isArray(channelIds)) {
                return new Response(
                    JSON.stringify({ error: 'channelIds must be an array' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const success = await reorderLauncherChannels(channelIds);
            
            if (!success) {
                return new Response(
                    JSON.stringify({ error: 'Failed to reorder channels' }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }

            logger.info('Reordered launcher channels', { prefix: 'ADMIN_API' });
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        logger.error(`Admin launcher config PUT error: ${err}`, { prefix: 'ADMIN_API' });
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return new Response(
                JSON.stringify({ error: 'Missing channel ID' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const success = await deleteLauncherChannel(parseInt(id));
        
        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to delete channel' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        logger.info(`Deleted launcher channel ID ${id}`, { prefix: 'ADMIN_API' });
        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        logger.error(`Admin launcher config DELETE error: ${err}`, { prefix: 'ADMIN_API' });
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

