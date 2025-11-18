import { getPool } from './db';
import { RefreshChecksums as refreshLib } from './checksums';

export async function refreshChecksums() {
    try {
        await refreshLib();
        return { success: true, message: "Checksum were successfully refreshed" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred. Please check logs" };
    }
}

export async function addChecksum(checksum: number, description: string | null, sdkversion: string) {
    if (!checksum || !sdkversion) return { success: false, message: "Missing required fields" };
    if (!description) description = null;

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `checksums` WHERE `checksum`=?", [checksum]);
        if (Array.isArray(rows) && rows.length > 0) {
            return { success: false, message: `Checksum is already added` };
        }

        await pool.execute("INSERT INTO `checksums` (`checksum`, `description`, `sdkversion`) VALUES (?,?,?)", [checksum, description, sdkversion]);
        return { success: true, message: "Checksum was successfully added" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function updateChecksum(checksum: number, description: string | null, sdkversion: string) {
    if (!checksum || !sdkversion) return { success: false, message: "Missing required fields" };
    if (!description) description = null;

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `checksums` WHERE `checksum`=?", ["" + checksum]);
        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: "Checksum dosnt exist" };
        }

        await pool.execute("UPDATE `checksums` SET `description`=?, `sdkversion`=? WHERE `checksum`=?", [description, sdkversion, "" + checksum]);
        return { success: true, message: `Checksum was successfully updated` };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}

export async function removeChecksum(checksum: number) {
    if (!checksum) return { success: false, message: "Missing checksum" };

    try {
        const pool = getPool();
        if (!pool) return { success: false, message: "Database not initialized" };

        const [rows] = await pool.execute("SELECT * FROM `checksums` WHERE `checksum`=?", ["" + checksum]);
        if (Array.isArray(rows) && rows.length === 0) {
            return { success: false, message: `Checksum dosnt exist` };
        }

        await pool.execute("DELETE FROM `checksums` WHERE `checksum`=?", ["" + checksum]);
        return { success: true, message: "Checksum was successfully removed" };
    } catch (err) {
        console.error(err);
        return { success: false, message: "An error occurred" };
    }
}
