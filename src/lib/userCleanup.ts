import { getPool } from './db.ts';
import { logger } from './logger.ts';
import { logGeneralEvent } from './discord.ts';

export async function cleanupInactiveUsers(hours: number = 24): Promise<number> {
    try {
        const pool = getPool();
        if (!pool) return 0;

        // Delete users whose last_seen is older than the given hours
        const [result]: any = await pool.execute(
            'DELETE FROM `users` WHERE `last_seen` < DATE_SUB(NOW(), INTERVAL ? HOUR)',
            [hours]
        );

        const removed = (result && typeof result.affectedRows === 'number') ? result.affectedRows : 0;
        if (removed > 0) {
            await logGeneralEvent(`Cleaned up ${removed} users inactive > ${hours}h`);
        }
        return removed;
    } catch (err) {
        logger.error(`User cleanup error: ${err}`, { prefix: 'USER-CLEANUP' });
        return 0;
    }
}


