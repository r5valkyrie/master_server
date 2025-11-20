import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { logger } from './logger.ts';

let pool: mysql.Pool | null = null;

export function getPool() {
    if (pool) {
        return pool;
    }
    
    if (!process.env.MYSQL_HOST) {
        return null;
    }

    try {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            database: process.env.MYSQL_DB,
            password: process.env.MYSQL_PASS,
            multipleStatements: true,
        });
        return pool;
    } catch (err) {
        logger.error(`Connection pool error: ${err}`, { prefix: 'DB' });
        return null;
    }
}

export async function GetUserFlags(id: number | string) {
    try {
        const pool = getPool();
        if (!pool) return 0;
        const idStr = String(id);
        const [rows] = await pool.execute("SELECT flags FROM `users` WHERE `steam_id`=?", [idStr]);
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets) && packets.length > 0) {
            return packets[0].flags as number;
        }
        return 0;
    } catch (err) {
        logger.error(`LogUser error: ${err}`, { prefix: 'DB' });
        return 0;
    }
}

export async function LogUser(id: number | string, name: string, flags = 0) {
    try {
        const pool = getPool();
        if (!pool) return;
        const idStr = String(id);
        if (!/^\d+$/.test(idStr)) return;

        await pool.execute("INSERT INTO `username_history` (`steam_id`, `name`) VALUES (?,?) ON DUPLICATE KEY UPDATE `last_seen`=NOW()", [idStr, name]);
        
        const [rows] = await pool.execute("SELECT * FROM `users` WHERE `steam_id`=?", [idStr]);
        const packets = rows as RowDataPacket[];
        
        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().split('T')[0];

        if (Array.isArray(packets) && packets.length > 0) {
            const lastSeenDate = new Date(packets[0].last_seen).toISOString().split('T')[0];
            if (lastSeenDate !== formattedDate) {
                await pool.execute(
                    "INSERT INTO `daily_playercount` (`date`, `total_players`) VALUES (?, 1) ON DUPLICATE KEY UPDATE `total_players` = `total_players` + 1",
                    [formattedDate]
                );
            }
            const diff = currentDate.getTime() - new Date(packets[0].last_seen).getTime();
            if (diff > 300000) {
                await pool.execute("UPDATE `users` SET `name`=?, `last_seen`=NOW(), `flags`=? WHERE `steam_id`=?", [name, flags, idStr]);
            }
        } else {
            // Ensure we correct any rows where a unique key other than steam_id (e.g., name) collides
            await pool.execute(
                "INSERT INTO `users` (`steam_id`, `name`, `flags`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `steam_id`=VALUES(`steam_id`), `name`=VALUES(`name`), `flags`=VALUES(`flags`)",
                [idStr, name, flags]
            );
            await pool.execute(
                "INSERT INTO `daily_playercount` (`date`, `total_players`) VALUES (?, 1) ON DUPLICATE KEY UPDATE `total_players` = `total_players` + 1",
                [formattedDate]
            );
        }
    } catch (err) {
        console.log(err);
    }
}

export async function LogUserAuth(id: number | string, success: boolean, msg = "") {
    try {
        const pool = getPool();
        if (!pool) return;
        const idStr = String(id);
        await pool.execute("INSERT INTO `user_auth_history` (`steam_id`, `successful`, `msg`) VALUES (?, ?, ?)", [idStr, success, msg]);
    } catch (err) {
        logger.error(`LogUserAuth error: ${err}`, { prefix: 'DB' });
    }
}

export async function AddUserAuthCountryMetric(code: string) {
    try {
        const pool = getPool();
        if (!pool) return;
        await pool.execute("INSERT INTO `country_metrics` VALUES (?,?) ON DUPLICATE KEY UPDATE `count`=`count`+1", [code, 1]);
    } catch (err) {
        logger.error(`AddUserAuthCountryMetric error: ${err}`, { prefix: 'DB' });
    }
}

export async function GetSteamIdByUsername(name: string): Promise<string | null> {
    try {
        const pool = getPool();
        if (!pool) return null;
        // Exact match, prefer most recently seen
        const [rows] = await pool.execute("SELECT steam_id FROM `users` WHERE `name`=? ORDER BY `last_seen` DESC LIMIT 1", [name]);
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets) && packets.length > 0) {
            return (packets[0].steam_id as string) || null;
        }
        return null;
    } catch (err) {
        logger.error(`GetSteamIdByUsername error: ${err}`, { prefix: 'DB' });
        return null;
    }
}

export async function SearchSteamIdsByUsername(name: string, limit = 5): Promise<Array<{ steam_id: string, name: string }>> {
    try {
        const pool = getPool();
        if (!pool) return [];
        const pattern = `%${name}%`;
        const [rows] = await pool.execute("SELECT steam_id, name FROM `users` WHERE `name` LIKE ? ORDER BY `last_seen` DESC LIMIT ?", [pattern, limit]);
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets)) {
            return packets as Array<{ steam_id: string, name: string }>;
        }
        return [];
    } catch (err) {
        logger.error(`SearchSteamIdsByUsername error: ${err}`, { prefix: 'DB' });
        return [];
    }
}