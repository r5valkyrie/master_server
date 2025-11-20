/**
 * Server startup initialization
 * Runs once when the server starts to initialize all background tasks
 */

import { startBanCleanupScheduler } from './banCleanupScheduler';
import { startServerPresenceTracker, startServerCountUpdater, startActiveServersListUpdater } from './serverPresenceTracker';
import { startPrefixCommandListener } from './discord';
import { startThunderstoreWatcher } from './thunderstoreWatcher';

let initialized = false;

export async function initializeStartup(): Promise<void> {
    if (initialized) return;
    initialized = true;

    try {
        startBanCleanupScheduler();
        console.log('> Ban cleanup scheduler started');
    } catch (err) {
        console.error('> Ban cleanup scheduler failed:', err);
    }

    try {
        startServerPresenceTracker();
        console.log('> Server presence tracker started');
    } catch (err) {
        console.error('> Server presence tracker failed:', err);
    }

    try {
        startServerCountUpdater();
        console.log('> Server count updater started');
    } catch (err) {
        console.error('> Server count updater failed:', err);
    }

    try {
        startActiveServersListUpdater();
        console.log('> Server browser updater started');
    } catch (err) {
        console.error('> Server browser updater failed:', err);
    }

    try {
        startPrefixCommandListener();
        console.log('> Discord prefix command listener started');
    } catch (err) {
        console.error('> Discord prefix command listener failed:', err);
    }

    try {
        await startThunderstoreWatcher();
        console.log('> Thunderstore watcher started');
    } catch (err) {
        console.error('> Thunderstore watcher failed:', err);
    }
}
