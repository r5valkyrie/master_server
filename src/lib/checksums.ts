import { getPool } from './db.ts';

let CHECKSUMS_TABLE: any[] = [];

export async function RefreshChecksums() {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT * FROM checksums");
        
        if (Array.isArray(rows)) {
            CHECKSUMS_TABLE = rows;
        }
    } catch (err) {
        console.log(err);
    }
}

export function IsChecksumSupported(checksum: number, version: string) {
    return CHECKSUMS_TABLE.some((row) => row.checksum === checksum && row.sdkversion === version);
}

async function initialize() {
    if (getPool()) {
        await RefreshChecksums();
    }
}
initialize();
