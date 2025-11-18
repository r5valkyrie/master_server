import { getPool } from './db';
import axios from 'axios';

const NO_BAN_REASON_PROVIDED = "You have been banned.";

async function getUsernameBySteamID(id: number | string) {
    if (id == null || id === 0) return "(null id)";
    try {
        const pool = getPool();
        if (!pool) return "(db error)";
        const [rows] = await pool.execute("SELECT name FROM `users` WHERE `steam_id`=?", [String(id)]);
        if (Array.isArray(rows) && rows.length > 0) {
            return (rows[0] as { name: string }).name;
        } else {
            return "(unknown)";
        }
    } catch (err) {
        console.log(err);
        return "(error)";
    }
}

async function SendDiscordLog(msg: string) {
    if (process.env.DISCORD_WEBHOOK_ADMIN) {
        axios.post(process.env.DISCORD_WEBHOOK_ADMIN, { content: msg });
    }
}

export async function getPlayerBanStatus(id: number | string | null, ip: string | null) {
    // Steam ID validation - only accept valid Steam IDs
    if (id !== null && id !== 0) {
        const steamId = String(id);
        const isValidSteamId = /^765611\d{11}$/.test(steamId);
        
        if (isValidSteamId) {
            console.log(`[BAN_SYSTEM] Valid Steam ID detected: ${steamId} - proceeding with database check`);
        } else {
            console.log(`[BAN_SYSTEM] Invalid Steam ID detected: ${steamId} - only Steam IDs are supported`);
            // Still proceed with database check for backwards compatibility
        }
    }

    if (!id) id = null;
    if (!ip) ip = null;

    try {
        const pool = getPool();
        if (!pool) return { isBanned: false };

        const idParam: string | null = id == null ? null : String(id);
        let queryParams: Array<string | null> = [idParam, ip];
        if (ip != null && ip.indexOf("::ffff:") === 0) {
            queryParams = [idParam, ip.slice(7)];
        }

        const [rows] = await pool.execute("SELECT * FROM `banned_users` WHERE `identifier`=? OR `identifier`=? ORDER BY `identifier_type` DESC", queryParams);

        if (Array.isArray(rows) && rows.length > 0) {
            const row = rows[0] as { ban_reason: string, ban_expiry_date: Date, ban_type: number };
            let reason = row.ban_reason;
            const expiryDate = row.ban_expiry_date;

            if (expiryDate == null || expiryDate >= new Date()) {
                if (!reason) reason = NO_BAN_REASON_PROVIDED;
                return { isBanned: true, banType: row.ban_type, banExpires: expiryDate, banReason: reason };
            }
        }
    } catch (err) {
        console.error(err);
    }

    return { isBanned: false };
}

export async function addBan(identifier: string | number, reason: string | null, banType = 0, banExpiryDate: Date | null = null) {
    if (!identifier) return { success: false, message: "No identifier provided" };
    if (!reason) reason = null;

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `banned_users` WHERE `identifier`=?", [identifier]);
        if (Array.isArray(rows) && rows.length > 0) {
            return { success: false, message: `User is already banned` };
        }

        const type = isNaN(identifier as number) ? 0 : 1;
        await pool.execute("INSERT INTO `banned_users` (`identifier`, `identifier_type`, `ban_reason`, `ban_type`, `ban_expiry_date`) VALUES (?,?,?,?,?)", [identifier, type, reason, banType, banExpiryDate]);

        return { success: true, message: "User was successfully banned" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function removeBan(identifier: string | number) {
    if (!identifier) return { success: false, message: "No identifier provided" };

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `banned_users` WHERE `identifier`=?", [identifier]);
        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: `User is not banned` };
        }

        await pool.execute("DELETE FROM `banned_users` WHERE `identifier`=?", [identifier]);

        return { success: true, message: "User was successfully unbanned" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function updateBanReason(identifier: string | number, reason: string | null) {
    if (!identifier) return { success: false, message: "No identifier provided" };
    if (!reason) reason = null;

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `banned_users` WHERE `identifier`=?", ["" + identifier]);

        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: "User is not banned" };
        }

        await pool.execute("UPDATE `banned_users` SET `ban_reason`=? WHERE `identifier`=?", [reason, "" + identifier]);

        return { success: true, message: `Updated ban reason for '${identifier}'.` };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function getBulkBanStatusArray(users: { id: number, ip: string }[]) {
    if (users.length === 0) return [];
    
    const banned = [];
    
    for (const user of users) {
        const player = await getPlayerBanStatus(user.id, user.ip);
        if (player.isBanned && user.ip !== "::1" && user.ip !== "::ffff:127.0.0.1") {
            banned.push({
                ...user,
                banType: player.banType,
                banExpires: player.isBanned ? player.banExpires : undefined,
                reason: player.banReason
            });
        }
    }
    
    return banned;
}
