import { getPool } from './db';
import { logGeneralEvent } from './discord';

export async function cleanupExpiredBans(): Promise<number> {
    try {
        const pool = getPool();
        if (!pool) return 0;

        const [result]: any = await pool.execute(
            "DELETE FROM `banned_users` WHERE `ban_expiry_date` IS NOT NULL AND `ban_expiry_date` < NOW()"
        );

        const removed = (result && typeof result.affectedRows === 'number') ? result.affectedRows : 0;
        if (removed > 0) {
            await logGeneralEvent(`🧹 Cleaned up ${removed} expired bans`);
        }
        return removed;
    } catch (err) {
        console.error('cleanupExpiredBans error:', err);
        return 0;
    }
}


