import { getPool } from './db';
import type { RowDataPacket } from 'mysql2/promise';

export interface VerifiedMod {
    id?: number;
    name: string;
    owner: string;
    thunderstore_link: string;
    created_at?: string;
    updated_at?: string;
}

export async function getVerifiedMods(): Promise<VerifiedMod[]> {
    try {
        const pool = getPool();
        if (!pool) return [];
        
        const [rows] = await pool.execute(
            "SELECT id, name, owner, thunderstore_link, created_at, updated_at FROM `verified_mods` ORDER BY created_at DESC"
        );
        
        const packets = rows as RowDataPacket[];
        return packets.map(row => ({
            id: row.id,
            name: row.name,
            owner: row.owner,
            thunderstore_link: row.thunderstore_link,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));
    } catch (error) {
        console.error('Error fetching verified mods:', error);
        return [];
    }
}

export async function searchVerifiedMods(query: string): Promise<VerifiedMod[]> {
    try {
        const pool = getPool();
        if (!pool) return [];
        
        const searchPattern = `%${query}%`;
        const [rows] = await pool.execute(
            "SELECT id, name, owner, thunderstore_link, created_at, updated_at FROM `verified_mods` WHERE name LIKE ? OR owner LIKE ? ORDER BY created_at DESC",
            [searchPattern, searchPattern]
        );
        
        const packets = rows as RowDataPacket[];
        return packets.map(row => ({
            id: row.id,
            name: row.name,
            owner: row.owner,
            thunderstore_link: row.thunderstore_link,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));
    } catch (error) {
        console.error('Error searching verified mods:', error);
        return [];
    }
}

export async function addVerifiedMod(name: string, owner: string, thunderstore_link: string): Promise<{ success: boolean; error?: string }> {
    try {
        const pool = getPool();
        if (!pool) {
            return { success: false, error: "Database connection failed" };
        }
        
        // Validate inputs
        if (!name || !owner || !thunderstore_link) {
            return { success: false, error: "Name, owner, and thunderstore link are required" };
        }
        
        // Validate thunderstore link format
        const thunderstorePattern = /^https:\/\/thunderstore\.io\/c\/[^\/]+\/p\/[^\/]+\/[^\/]+\/?$/;
        if (!thunderstorePattern.test(thunderstore_link)) {
            return { success: false, error: "Invalid Thunderstore link format" };
        }
        
        await pool.execute(
            "INSERT INTO `verified_mods` (name, owner, thunderstore_link) VALUES (?, ?, ?)",
            [name, owner, thunderstore_link]
        );
        
        return { success: true };
    } catch (error: any) {
        console.error('Error adding verified mod:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, error: "This mod already exists in the verified list" };
        }
        
        return { success: false, error: "Failed to add verified mod" };
    }
}

export async function removeVerifiedMod(id: number): Promise<{ success: boolean; error?: string }> {
    try {
        const pool = getPool();
        if (!pool) {
            return { success: false, error: "Database connection failed" };
        }
        
        const [result] = await pool.execute(
            "DELETE FROM `verified_mods` WHERE id = ?",
            [id]
        );
        
        const deleteResult = result as any;
        if (deleteResult.affectedRows === 0) {
            return { success: false, error: "Verified mod not found" };
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error removing verified mod:', error);
        return { success: false, error: "Failed to remove verified mod" };
    }
}

export async function updateVerifiedMod(id: number, name: string, owner: string, thunderstore_link: string): Promise<{ success: boolean; error?: string }> {
    try {
        const pool = getPool();
        if (!pool) {
            return { success: false, error: "Database connection failed" };
        }
        
        // Validate inputs
        if (!name || !owner || !thunderstore_link) {
            return { success: false, error: "Name, owner, and thunderstore link are required" };
        }
        
        // Validate thunderstore link format
        const thunderstorePattern = /^https:\/\/thunderstore\.io\/c\/[^\/]+\/p\/[^\/]+\/[^\/]+\/?$/;
        if (!thunderstorePattern.test(thunderstore_link)) {
            return { success: false, error: "Invalid Thunderstore link format" };
        }
        
        const [result] = await pool.execute(
            "UPDATE `verified_mods` SET name = ?, owner = ?, thunderstore_link = ? WHERE id = ?",
            [name, owner, thunderstore_link, id]
        );
        
        const updateResult = result as any;
        if (updateResult.affectedRows === 0) {
            return { success: false, error: "Verified mod not found" };
        }
        
        return { success: true };
    } catch (error: any) {
        console.error('Error updating verified mod:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, error: "This mod name and owner combination already exists" };
        }
        
        return { success: false, error: "Failed to update verified mod" };
    }
}
