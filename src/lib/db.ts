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

export async function getDiscordConfig(key: string): Promise<string | null> {
    try {
        const pool = getPool();
        if (!pool) return null;
        const [rows] = await pool.execute("SELECT config_value FROM `discord_config` WHERE `config_key`=?", [key]);
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets) && packets.length > 0) {
            return (packets[0].config_value as string) || null;
        }
        return null;
    } catch (err) {
        logger.error(`getDiscordConfig error: ${err}`, { prefix: 'DB' });
        return null;
    }
}

export async function getAllDiscordConfig(): Promise<Array<{ config_key: string, config_value: string, description: string }>> {
    try {
        const pool = getPool();
        if (!pool) return [];
        const [rows] = await pool.execute("SELECT config_key, config_value, description FROM `discord_config` ORDER BY config_key");
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets)) {
            return packets as Array<{ config_key: string, config_value: string, description: string }>;
        }
        return [];
    } catch (err) {
        logger.error(`getAllDiscordConfig error: ${err}`, { prefix: 'DB' });
        return [];
    }
}

export async function setDiscordConfig(key: string, value: string): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;
        await pool.execute("UPDATE `discord_config` SET `config_value`=?, `updated_at`=NOW() WHERE `config_key`=?", [value, key]);
        return true;
    } catch (err) {
        logger.error(`setDiscordConfig error: ${err}`, { prefix: 'DB' });
        return false;
    }
}

export async function getDiscordBotToken(): Promise<string | null> {
    try {
        const pool = getPool();
        if (!pool) return process.env.DISCORD_BOT_TOKEN || null;
        const [rows] = await pool.execute("SELECT config_value FROM `discord_config` WHERE `config_key`='DISCORD_BOT_TOKEN'");
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets) && packets.length > 0) {
            const value = packets[0].config_value as string;
            return value && value.trim() !== '' ? value.trim() : process.env.DISCORD_BOT_TOKEN || null;
        }
        return process.env.DISCORD_BOT_TOKEN || null;
    } catch (err) {
        logger.error(`getDiscordBotToken error: ${err}`, { prefix: 'DB' });
        return process.env.DISCORD_BOT_TOKEN || null;
    }
}

// ============================================================================
// API KEY FUNCTIONS
// ============================================================================

export interface ApiKey {
    id: number;
    key_name: string;
    key_hash: string;
    key_prefix: string;
    description: string | null;
    active: number;
    last_used: string | null;
    created_at: string;
    updated_at: string;
}

export async function getAllApiKeys(): Promise<ApiKey[]> {
    try {
        const pool = getPool();
        if (!pool) return [];
        const [rows] = await pool.execute("SELECT * FROM `api_keys` ORDER BY `created_at` DESC");
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets)) {
            return packets as ApiKey[];
        }
        return [];
    } catch (err) {
        logger.error(`getAllApiKeys error: ${err}`, { prefix: 'DB' });
        return [];
    }
}

export async function verifyApiKey(key: string): Promise<{ valid: boolean; keyId?: number }> {
    try {
        if (!key || typeof key !== 'string') return { valid: false };
        
        const pool = getPool();
        if (!pool) return { valid: false };
        
        // Get the key prefix (first 10 chars)
        const prefix = key.substring(0, 10);
        const [rows] = await pool.execute(
            "SELECT id, key_hash FROM `api_keys` WHERE `key_prefix`=? AND `active`=1",
            [prefix]
        );
        
        if (!Array.isArray(rows) || rows.length === 0) {
            return { valid: false };
        }
        
        const bcrypt = await import('bcrypt');
        const match = await bcrypt.compare(key, (rows[0] as any).key_hash);
        const keyId = (rows[0] as any).id;
        
        if (match) {
            // Update last_used timestamp
            await pool.execute(
                "UPDATE `api_keys` SET `last_used`=NOW() WHERE `id`=?",
                [keyId]
            );
        }
        
        return { valid: match, keyId: match ? keyId : undefined };
    } catch (err) {
        logger.error(`verifyApiKey error: ${err}`, { prefix: 'DB' });
        return { valid: false };
    }
}

export async function createApiKey(keyName: string, keyHash: string, keyPrefix: string, description?: string): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;
        await pool.execute(
            "INSERT INTO `api_keys` (`key_name`, `key_hash`, `key_prefix`, `description`) VALUES (?, ?, ?, ?)",
            [keyName, keyHash, keyPrefix, description || null]
        );
        return true;
    } catch (err) {
        logger.error(`createApiKey error: ${err}`, { prefix: 'DB' });
        return false;
    }
}

export async function deleteApiKey(id: number): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;
        await pool.execute("DELETE FROM `api_keys` WHERE `id`=?", [id]);
        return true;
    } catch (err) {
        logger.error(`deleteApiKey error: ${err}`, { prefix: 'DB' });
        return false;
    }
}

export async function toggleApiKey(id: number, active: boolean): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;
        await pool.execute("UPDATE `api_keys` SET `active`=? WHERE `id`=?", [active ? 1 : 0, id]);
        return true;
    } catch (err) {
        logger.error(`toggleApiKey error: ${err}`, { prefix: 'DB' });
        return false;
    }
}

// ============================================================================
// SYSTEM SETTINGS FUNCTIONS
// ============================================================================

export interface SystemSetting {
    setting_key: string;
    setting_value: string;
    description: string;
}

export async function getAllSystemSettings(): Promise<SystemSetting[]> {
    try {
        const pool = getPool();
        if (!pool) return [];
        const [rows] = await pool.execute("SELECT `setting_key`, `setting_value`, `description` FROM `system_settings` ORDER BY `setting_key`");
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets)) {
            return packets as SystemSetting[];
        }
        return [];
    } catch (err) {
        logger.error(`getAllSystemSettings error: ${err}`, { prefix: 'DB' });
        return [];
    }
}

export async function getSystemSetting(key: string): Promise<string | null> {
    try {
        const pool = getPool();
        if (!pool) return null;
        const [rows] = await pool.execute("SELECT `setting_value` FROM `system_settings` WHERE `setting_key`=?", [key]);
        const packets = rows as RowDataPacket[];
        if (Array.isArray(packets) && packets.length > 0) {
            return packets[0].setting_value as string;
        }
        return null;
    } catch (err) {
        logger.error(`getSystemSetting error: ${err}`, { prefix: 'DB' });
        return null;
    }
}

export async function setSystemSetting(key: string, value: string): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;
        await pool.execute(
            "INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `setting_value`=?",
            [key, value, value]
        );
        return true;
    } catch (err) {
        logger.error(`setSystemSetting error: ${err}`, { prefix: 'DB' });
        return false;
    }
}