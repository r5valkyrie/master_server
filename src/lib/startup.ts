/**
 * Server startup initialization
 * Runs once when the server starts to initialize all background tasks
 */

import { startBanCleanupScheduler } from './banCleanupScheduler.ts';
import { startServerPresenceTracker, startServerCountUpdater, startActiveServersListUpdater } from './serverPresenceTracker.ts';
import { startPrefixCommandListener } from './discord.ts';
import { startThunderstoreWatcher } from './thunderstoreWatcher.ts';
import { logger } from './logger.ts';

let initialized = false;

export async function initializeStartup(): Promise<void> {
    if (initialized) return;
    initialized = true;

    try {
        startBanCleanupScheduler();
        logger.success('Ban cleanup scheduler started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Ban cleanup scheduler failed: ${err}`, { prefix: 'STARTUP' });
    }

    try {
        startServerPresenceTracker();
        logger.success('Server presence tracker started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Server presence tracker failed: ${err}`, { prefix: 'STARTUP' });
    }

    try {
        startServerCountUpdater();
        logger.success('Server count updater started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Server count updater failed: ${err}`, { prefix: 'STARTUP' });
    }

    try {
        startActiveServersListUpdater();
        logger.success('Server browser updater started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Server browser updater failed: ${err}`, { prefix: 'STARTUP' });
    }

    try {
        startPrefixCommandListener();
        logger.success('Discord prefix command listener started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Discord prefix command listener failed: ${err}`, { prefix: 'STARTUP' });
    }

    try {
        await startThunderstoreWatcher();
        logger.success('Thunderstore watcher started', { prefix: 'STARTUP' });
    } catch (err) {
        logger.error(`Thunderstore watcher failed: ${err}`, { prefix: 'STARTUP' });
    }
}
