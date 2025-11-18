import { cleanupExpiredBans } from './banCleanup';
import { cleanupInactiveUsers } from './userCleanup';
import { logGeneralEvent } from './discord';

let schedulerStarted = false;

export function startBanCleanupScheduler(): void {
    if (schedulerStarted) return;
    schedulerStarted = true;

    const hours = parseInt(process.env.BAN_CLEANUP_INTERVAL_HOURS || '12', 10) || 12;
    const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;

    // One-time startup notification
    try {
        const env = process.env.NODE_ENV || 'development';
        logGeneralEvent(`🟢 Master server online (env: ${env})`).catch(() => {});
    } catch {}

    // Run once on startup
    cleanupExpiredBans().then((removed) => {
        if (removed > 0) {
            console.log(`[ban-cleanup] Removed ${removed} expired bans on startup`);
        }
    }).catch(() => {});

    setInterval(async () => {
        try {
            const removed = await cleanupExpiredBans();
            if (removed > 0) {
                console.log(`[ban-cleanup] Removed ${removed} expired bans`);
            }
            const userHours = parseInt(process.env.USER_CLEANUP_INACTIVE_HOURS || '24', 10) || 24;
            const removedUsers = await cleanupInactiveUsers(userHours);
            if (removedUsers > 0) {
                console.log(`[user-cleanup] Removed ${removedUsers} inactive users (> ${userHours}h)`);
            }
        } catch (err) {
            console.error('[ban-cleanup] Error during cleanup:', err);
        }
    }, intervalMs);
}


