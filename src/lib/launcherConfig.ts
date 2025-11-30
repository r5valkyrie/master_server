import { getPool } from './db.ts';
import type { RowDataPacket } from 'mysql2/promise';
import { logger } from './logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface LauncherChannel {
    id: number;
    name: string;
    game_url: string;
    dedi_url: string;
    enabled: boolean;
    requires_key: boolean;
    allow_updates: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

export interface LauncherConfig {
    backgroundVideo: string;
    channels: Array<{
        name: string;
        game_url: string;
        dedi_url: string;
        enabled: boolean;
        requires_key: boolean;
        allow_updates: boolean;
    }>;
}

// ============================================================================
// CONFIG FUNCTIONS
// ============================================================================

/**
 * Get the full launcher configuration as JSON (for the launcher API)
 */
export async function getLauncherConfig(): Promise<LauncherConfig | null> {
    try {
        const pool = getPool();
        if (!pool) return null;

        // Get background video config
        const [configRows] = await pool.execute(
            "SELECT config_value FROM `launcher_config` WHERE `config_key`='backgroundVideo'"
        );
        const configPackets = configRows as RowDataPacket[];
        const backgroundVideo = (configPackets.length > 0) 
            ? configPackets[0].config_value 
            : 'shortshowcr5v.mp4';

        // Get all enabled channels ordered by display_order
        const [channelRows] = await pool.execute(
            "SELECT name, game_url, dedi_url, enabled, requires_key, allow_updates FROM `launcher_channels` ORDER BY `display_order` ASC"
        );
        const channelPackets = channelRows as RowDataPacket[];
        
        const channels = channelPackets.map((ch: any) => ({
            name: ch.name,
            game_url: ch.game_url,
            dedi_url: ch.dedi_url,
            enabled: ch.enabled === 1,
            requires_key: ch.requires_key === 1,
            allow_updates: ch.allow_updates === 1
        }));

        return {
            backgroundVideo,
            channels
        };
    } catch (err) {
        logger.error(`getLauncherConfig error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return null;
    }
}

/**
 * Get a specific launcher config value
 */
export async function getLauncherConfigValue(key: string): Promise<string | null> {
    try {
        const pool = getPool();
        if (!pool) return null;

        const [rows] = await pool.execute(
            "SELECT config_value FROM `launcher_config` WHERE `config_key`=?",
            [key]
        );
        const packets = rows as RowDataPacket[];
        
        if (packets.length > 0) {
            return packets[0].config_value as string;
        }
        return null;
    } catch (err) {
        logger.error(`getLauncherConfigValue error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return null;
    }
}

/**
 * Set a launcher config value
 */
export async function setLauncherConfigValue(key: string, value: string): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;

        await pool.execute(
            "INSERT INTO `launcher_config` (`config_key`, `config_value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `config_value`=?",
            [key, value, value]
        );
        return true;
    } catch (err) {
        logger.error(`setLauncherConfigValue error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return false;
    }
}

// ============================================================================
// CHANNEL FUNCTIONS
// ============================================================================

/**
 * Get all launcher channels (for admin panel)
 */
export async function getAllLauncherChannels(): Promise<LauncherChannel[]> {
    try {
        const pool = getPool();
        if (!pool) return [];

        const [rows] = await pool.execute(
            "SELECT * FROM `launcher_channels` ORDER BY `display_order` ASC"
        );
        const packets = rows as RowDataPacket[];
        
        return packets.map((ch: any) => ({
            ...ch,
            enabled: ch.enabled === 1,
            requires_key: ch.requires_key === 1,
            allow_updates: ch.allow_updates === 1
        }));
    } catch (err) {
        logger.error(`getAllLauncherChannels error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return [];
    }
}

/**
 * Get a single launcher channel by ID
 */
export async function getLauncherChannel(id: number): Promise<LauncherChannel | null> {
    try {
        const pool = getPool();
        if (!pool) return null;

        const [rows] = await pool.execute(
            "SELECT * FROM `launcher_channels` WHERE `id`=?",
            [id]
        );
        const packets = rows as RowDataPacket[];
        
        if (packets.length > 0) {
            const ch = packets[0];
            return {
                ...ch,
                enabled: ch.enabled === 1,
                requires_key: ch.requires_key === 1,
                allow_updates: ch.allow_updates === 1
            } as LauncherChannel;
        }
        return null;
    } catch (err) {
        logger.error(`getLauncherChannel error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return null;
    }
}

/**
 * Create a new launcher channel
 */
export async function createLauncherChannel(data: {
    name: string;
    game_url: string;
    dedi_url: string;
    enabled?: boolean;
    requires_key?: boolean;
    allow_updates?: boolean;
    display_order?: number;
}): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;

        // If no display_order provided, set it to be last
        let displayOrder = data.display_order;
        if (displayOrder === undefined) {
            const [rows] = await pool.execute(
                "SELECT MAX(display_order) as max_order FROM `launcher_channels`"
            );
            const packets = rows as RowDataPacket[];
            displayOrder = (packets[0].max_order || 0) + 1;
        }

        await pool.execute(
            `INSERT INTO \`launcher_channels\` 
            (name, game_url, dedi_url, enabled, requires_key, allow_updates, display_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name,
                data.game_url,
                data.dedi_url,
                data.enabled !== false ? 1 : 0,
                data.requires_key === true ? 1 : 0,
                data.allow_updates !== false ? 1 : 0,
                displayOrder
            ]
        );
        return true;
    } catch (err) {
        logger.error(`createLauncherChannel error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return false;
    }
}

/**
 * Update an existing launcher channel
 */
export async function updateLauncherChannel(
    id: number,
    data: {
        name?: string;
        game_url?: string;
        dedi_url?: string;
        enabled?: boolean;
        requires_key?: boolean;
        allow_updates?: boolean;
        display_order?: number;
    }
): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;

        const updates: string[] = [];
        const values: any[] = [];

        if (data.name !== undefined) {
            updates.push('name=?');
            values.push(data.name);
        }
        if (data.game_url !== undefined) {
            updates.push('game_url=?');
            values.push(data.game_url);
        }
        if (data.dedi_url !== undefined) {
            updates.push('dedi_url=?');
            values.push(data.dedi_url);
        }
        if (data.enabled !== undefined) {
            updates.push('enabled=?');
            values.push(data.enabled ? 1 : 0);
        }
        if (data.requires_key !== undefined) {
            updates.push('requires_key=?');
            values.push(data.requires_key ? 1 : 0);
        }
        if (data.allow_updates !== undefined) {
            updates.push('allow_updates=?');
            values.push(data.allow_updates ? 1 : 0);
        }
        if (data.display_order !== undefined) {
            updates.push('display_order=?');
            values.push(data.display_order);
        }

        if (updates.length === 0) return true;

        values.push(id);
        const query = `UPDATE \`launcher_channels\` SET ${updates.join(', ')} WHERE id=?`;
        
        await pool.execute(query, values);
        return true;
    } catch (err) {
        logger.error(`updateLauncherChannel error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return false;
    }
}

/**
 * Delete a launcher channel
 */
export async function deleteLauncherChannel(id: number): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;

        await pool.execute("DELETE FROM `launcher_channels` WHERE `id`=?", [id]);
        return true;
    } catch (err) {
        logger.error(`deleteLauncherChannel error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return false;
    }
}

/**
 * Reorder launcher channels
 */
export async function reorderLauncherChannels(channelIds: number[]): Promise<boolean> {
    try {
        const pool = getPool();
        if (!pool) return false;

        // Update each channel with its new display order
        for (let i = 0; i < channelIds.length; i++) {
            await pool.execute(
                "UPDATE `launcher_channels` SET `display_order`=? WHERE `id`=?",
                [i + 1, channelIds[i]]
            );
        }
        return true;
    } catch (err) {
        logger.error(`reorderLauncherChannels error: ${err}`, { prefix: 'LAUNCHER_CONFIG' });
        return false;
    }
}

