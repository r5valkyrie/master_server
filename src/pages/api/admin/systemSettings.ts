import type { APIRoute } from 'astro';
import { getAllSystemSettings, setSystemSetting } from '../../../lib/db';
import { logger } from '../../../lib/logger';

/**
 * GET /api/admin/systemSettings - Retrieve all system settings
 * POST /api/admin/systemSettings - Update system settings
 * 
 * Note: Access control is handled by middleware.ts (master-only)
 */
export const GET: APIRoute = async (context) => {
  try {
    const settings = await getAllSystemSettings();
    return new Response(JSON.stringify({ success: true, settings }), { status: 200 });
  } catch (error) {
    logger.error(`Error fetching system settings: ${error}`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as any;
    const updates = body.updates as Array<{ key: string; value: string }> || [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No updates provided' }), { status: 400 });
    }

    // Update each setting
    for (const update of updates) {
      const key = String(update.key || '').trim();
      const value = String(update.value || '').trim();
      
      if (!key) continue;
      
      const result = await setSystemSetting(key, value);
      if (!result) {
        logger.warn(`Failed to update system setting: ${key}`, { prefix: 'SYSTEM_SETTINGS' });
      }
    }

    logger.info(`Updated ${updates.length} system setting(s)`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: true, updated: updates.length }), { status: 200 });
  } catch (error) {
    logger.error(`Error updating system settings: ${error}`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};
