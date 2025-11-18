import { getPool } from './db';

export let VERSION_TABLE: any[] = [];

export async function RefreshVersions() {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT * FROM versions");
        
        if (Array.isArray(rows)) {
            VERSION_TABLE = rows.map((v: any) => ({
                ...v,
                supported: v.supported == 1
            }));
        }
    } catch (err) {
        console.log(err);
    }
}

export function GetLatestVersion() {
    if (VERSION_TABLE.length === 0) {
        return null;
    }

    // Sort by version number, descending
    const sortedVersions = [...VERSION_TABLE].sort((a, b) => {
        const aParts = a.name.split('.').map(part => parseInt(part.replace(/[^0-9]/g, ''), 10));
        const bParts = b.name.split('.').map(part => parseInt(part.replace(/[^0-9]/g, ''), 10));

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            if (aPart !== bPart) {
                return bPart - aPart;
            }
        }
        return 0;
    });

    return sortedVersions[0].name;
}

async function GetVersionInfo(name: string) {
    if (VERSION_TABLE.length === 0) {
        await RefreshVersions();
    }
    return VERSION_TABLE.find(version => version.name == name) || null;
}

export async function IsVersionSupported(name: string) {
    const versionInfo = await GetVersionInfo(name);
    return versionInfo ? versionInfo.supported : false;
}

export async function IsChecksumsEnabled(name:string) {
    const versionInfo = await GetVersionInfo(name);
    return versionInfo ? versionInfo.checksums_enabled : false;
}

export async function IsVersionFlagSet(name: string, flag: number) {
    const versionInfo = await GetVersionInfo(name);
    return versionInfo ? (versionInfo.flags & flag) != 0 : false;
}

export const flags = {
    VF_REAL_TYPES: (1 << 0)
};

let initializationPromise: Promise<void> | null = null;

export function initializeVersions(): Promise<void> {
    if (!initializationPromise) {
        initializationPromise = (async () => {
            if (getPool()) {
                await RefreshVersions();
            }
        })();
    }
    return initializationPromise;
}

initializeVersions();
