import type { APIRoute } from 'astro';
import { getAllApiKeys, createApiKey, deleteApiKey, toggleApiKey } from '../../../lib/db';
import { logger } from '../../../lib/logger';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * GET /api/admin/apiKeys - Retrieve all API keys
 * POST /api/admin/apiKeys - Create a new API key
 * DELETE /api/admin/apiKeys - Delete an API key
 * PATCH /api/admin/apiKeys - Toggle API key active status
 * 
 * Note: Access control is handled by middleware.ts (master-only)
 */
export const GET: APIRoute = async (context) => {
  try {
    const keys = await getAllApiKeys();
    return new Response(JSON.stringify({ success: true, keys }), { status: 200 });
  } catch (error) {
    logger.error(`Error fetching API keys: ${error}`, { prefix: 'API_KEYS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as any;
    const { keyName, description } = body;

    if (!keyName || typeof keyName !== 'string' || !keyName.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'Key name is required' }), { status: 400 });
    }

    // Generate a new API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 10);

    // Store in database
    await createApiKey(keyName.trim(), keyHash, keyPrefix, description?.trim() || '');

    logger.info(`New API key created: ${keyName}`, { prefix: 'API_KEYS' });

    return new Response(JSON.stringify({ success: true, key: rawKey }), { status: 201 });
  } catch (error) {
    logger.error(`Error creating API key: ${error}`, { prefix: 'API_KEYS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as any;
    const { id } = body;

    if (!id || typeof id !== 'number') {
      return new Response(JSON.stringify({ success: false, error: 'Invalid key ID' }), { status: 400 });
    }

    await deleteApiKey(id);
    logger.info(`API key deleted: ID ${id}`, { prefix: 'API_KEYS' });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    logger.error(`Error deleting API key: ${error}`, { prefix: 'API_KEYS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as any;
    const { id, active } = body;

    if (!id || typeof id !== 'number' || typeof active !== 'boolean') {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), { status: 400 });
    }

    await toggleApiKey(id, active);
    logger.info(`API key toggled: ID ${id}, active: ${active}`, { prefix: 'API_KEYS' });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    logger.error(`Error toggling API key: ${error}`, { prefix: 'API_KEYS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

