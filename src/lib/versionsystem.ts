import { getPool } from './db.ts';
import { RefreshVersions as refreshLib } from './versions.ts';
import { logger } from './logger.ts';

export async function refreshVersions() {
    try {
        await refreshLib();
        return { success: true, message: "Versions were successfully refreshed" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred. Please check logs" };
    }
}

export async function addVersions(name: string, checksums_enabled: number, supported: number, flags: number) {
    if (!name || !supported || !flags || !checksums_enabled) return { success: false, message: "Missing required fields" };

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `versions` WHERE `name`=?", [name]);
        if (Array.isArray(rows) && rows.length > 0) {
            return { success: false, message: `Version is already added` };
        }

        await pool.execute("INSERT INTO `versions` (`name`, `supported`, `flags`, `checksums_enabled`) VALUES (?,?,?,?)", [name, supported, flags, checksums_enabled]);
        return { success: true, message: "Version was successfully added" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function updateVersions(name: string, checksums_enabled: number, supported: number, flags: number) {
    if (!name || !supported || !flags) return { success: false, message: "Missing required fields" };

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `versions` WHERE `name`=?", [name]);
        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: "Version dosnt exist" };
        }

        await pool.execute("UPDATE `versions` SET `supported`=?, `flags`=?, `checksums_enabled`=? WHERE `name`=?", [supported, flags, checksums_enabled, name]);
        return { success: true, message: `Updated version for '${name}'` };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function removeVersions(name: string) {
    if (!name) return { success: false, message: "Missing name" };

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `versions` WHERE `name`=?", [name]);
        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: `Version dosnt exist` };
        }

        await pool.execute("DELETE FROM `versions` WHERE `name`=?", [name]);
        return { success: true, message: "Version was successfully removed" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}
