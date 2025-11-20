// Discord rate limit tracking per endpoint
import { logger } from './logger.ts';
import { getDiscordConfig, getDiscordBotToken } from './db.ts';

interface RateLimitInfo {
    remaining: number;
    resetTimestamp: number;
    limit: number;
}

const discordRateLimits = new Map<string, RateLimitInfo>();
const requestQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

/**
 * Extract and track rate limit info from Discord response headers
 */
function updateRateLimitInfo(endpoint: string, headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const resetTimestamp = headers.get('x-ratelimit-reset');
    const limit = headers.get('x-ratelimit-limit');

    if (remaining !== null && resetTimestamp !== null && limit !== null) {
        discordRateLimits.set(endpoint, {
            remaining: parseInt(remaining, 10),
            resetTimestamp: Math.ceil(parseFloat(resetTimestamp) * 1000),
            limit: parseInt(limit, 10)
        });
    }
}

/**
 * Check if we should wait for rate limit reset
 */
async function waitForRateLimit(endpoint: string): Promise<void> {
    const info = discordRateLimits.get(endpoint);
    if (!info || info.remaining > 0) return;

    const now = Date.now();
    const waitTime = Math.max(0, info.resetTimestamp - now);
    
    if (waitTime > 0) {
        logger.warn(`Rate limited on ${endpoint}. Waiting ${Math.round(waitTime / 1000)}s`, { prefix: 'DISCORD' });
        await new Promise(resolve => setTimeout(resolve, waitTime + 100)); // Add 100ms buffer
    }
}

/**
 * Process queued Discord requests with rate limiting
 */
async function processRequestQueue(): Promise<void> {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
        const request = requestQueue.shift();
        if (request) {
            try {
                await request();
            } catch (err) {
                logger.error(`Error processing queued request: ${err}`, { prefix: 'DISCORD' });
            }
        }
        // Small delay between queued requests to avoid bursts
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    isProcessingQueue = false;
}

/**
 * Queue a Discord API request with rate limit handling
 */
async function queueDiscordRequest(
    url: string,
    options: RequestInit,
    endpoint: string,
    retries = 0
): Promise<Response> {
    const MAX_RETRIES = 3;

    const makeRequest = async (): Promise<Response> => {
        await waitForRateLimit(endpoint);

        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(10000)
            });

            updateRateLimitInfo(endpoint, response.headers);

            // Handle rate limit (429) with exponential backoff
            if (response.status === 429) {
                const retryAfter = response.headers.get('retry-after');
                const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, retries) * 1000;

                if (retries < MAX_RETRIES) {
                    logger.warn(`Request rate limited. Retrying after ${Math.round(waitMs / 1000)}s (attempt ${retries + 1}/${MAX_RETRIES})`, { prefix: 'DISCORD' });
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    return makeRequest();
                }
            }

            return response;
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError' && retries < MAX_RETRIES) {
                const backoffMs = Math.pow(2, retries) * 1000;
                logger.warn(`Request timeout. Retrying after ${Math.round(backoffMs / 1000)}s`, { prefix: 'DISCORD' });
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                return makeRequest();
            }
            throw err;
        }
    };

    return new Promise((resolve, reject) => {
        requestQueue.push(async () => {
            try {
                const result = await makeRequest();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        });
        processRequestQueue();
    });
}


export async function postDiscordWebhook(webhookUrl: string, content: string): Promise<void> {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(10000)
        });
    } catch (err) {
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            logger.error(`Webhook error: ${err}`, { prefix: 'DISCORD' });
        }
    }
}

async function postDiscordBotMessage(channelId: string, body: any): Promise<void> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return;
    try {
        const endpoint = `channels:${channelId}:messages`;
        const response = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            },
            endpoint
        );

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Bot message failed: ${response.status} - ${errorText}`, { prefix: 'DISCORD' });
        }
    } catch (err) {
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            logger.error(`Bot send error: ${err}`, { prefix: 'DISCORD' });
        }
    }
}

export async function deleteAllChannelMessages(channelId: string): Promise<void> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return;
    try {
        const endpoint = `channels:${channelId}:messages:list`;
        const listResp = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            { headers: { 'Authorization': `Bot ${botToken}` } },
            endpoint
        );

        if (!listResp.ok) return;
        const msgs = await listResp.json();

        // Delete messages sequentially with rate limiting
        for (const m of msgs) {
            try {
                const deleteEndpoint = `channels:${channelId}:messages:${m.id}`;
                await queueDiscordRequest(
                    `https://discord.com/api/v10/channels/${channelId}/messages/${m.id}`,
                    {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bot ${botToken}` }
                    },
                    deleteEndpoint
                );
            } catch {
                // Continue on individual delete failures
            }
        }
    } catch (err) {
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            logger.error(`Error deleting all messages: ${err}`, { prefix: 'DISCORD' });
        }
    }
}

export async function deleteOtherChannelMessages(channelId: string, keepMessageId: string): Promise<void> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken || !keepMessageId) return;
    try {
        const endpoint = `channels:${channelId}:messages:list`;
        const listResp = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            { headers: { 'Authorization': `Bot ${botToken}` } },
            endpoint
        );

        if (!listResp.ok) return;
        const msgs = await listResp.json();

        // Delete messages sequentially with rate limiting
        for (const m of msgs) {
            if (m.id === keepMessageId) continue;
            try {
                const deleteEndpoint = `channels:${channelId}:messages:${m.id}`;
                await queueDiscordRequest(
                    `https://discord.com/api/v10/channels/${channelId}/messages/${m.id}`,
                    {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bot ${botToken}` }
                    },
                    deleteEndpoint
                );
            } catch {
                // Continue on individual delete failures
            }
        }
    } catch (err) {
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            logger.error(`Error deleting other messages: ${err}`, { prefix: 'DISCORD' });
        }
    }
}

export async function postBotMessage(channelId: string, body: any): Promise<string | null> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return null;
    try {
        const endpoint = `channels:${channelId}:messages`;
        const resp = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            },
            endpoint
        );

        if (!resp.ok) return null;
        const data = await resp.json();
        return data?.id || null;
    } catch (err) {
        logger.error(`Error posting message: ${err}`, { prefix: 'DISCORD' });
        return null;
    }
}

export async function editBotMessage(channelId: string, messageId: string, body: any): Promise<void> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken || !messageId) return;
    try {
        const endpoint = `channels:${channelId}:messages:${messageId}`;
        await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            },
            endpoint
        );
    } catch (err) {
        logger.error(`Error editing message: ${err}`, { prefix: 'DISCORD' });
    }
}

// Lightweight message-based command handler for prefix commands
type CommandHandler = (args: string[], message: any) => Promise<void>;
const commandHandlers: Record<string, CommandHandler> = {};

export function registerCommand(name: string, handler: CommandHandler) {
    commandHandlers[name.toLowerCase()] = handler;
}

function isUserAllowed(userId: string): boolean {
    const allow = process.env.DISCORD_COMMAND_ALLOW_IDS || '';
    if (!allow) return false;
    const set = new Set(allow.split(',').map(s => s.trim()).filter(Boolean));
    return set.has(userId);
}

let commandListenerStarted = false;
export function startPrefixCommandListener(): void {
    if (commandListenerStarted) return;
    commandListenerStarted = true;

    // Use dynamic ESM import to load discord.js under ESM environment
    (async () => {
        try {
            const botToken = await getDiscordBotToken();
            if (!botToken) return;

            const mod: any = await import('discord.js');
            const { Client, GatewayIntentBits, Partials, Events } = mod;
            const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
            
            client.on(Events.ClientReady, async () => {
                const env = process.env.NODE_ENV || 'development';
                logger.info(`Master server online (env: ${env})`, { prefix: 'DISCORD' });
                await logGeneralEvent(`Master server online (env: ${env})`).catch(() => {});
            });
            
            client.on(Events.MessageCreate, async (message: any) => {
                try {
                    if (!message || message.author?.bot) return;
                    const content: string = String(message.content || '');
                    if (!content.startsWith('!')) return;
                    if (!isUserAllowed(String(message.author?.id || ''))) return;
                    const parts = content.slice(1).trim().split(/\s+/);
                    const cmd = (parts.shift() || '').toLowerCase();
                    const handler = commandHandlers[cmd];
                    if (!handler) return;
                    await handler(parts, message);
                } catch {}
            });
            await client.login(botToken);
        } catch (e) {
            logger.error(`Failed to start prefix command listener: ${e}`, { prefix: 'DISCORD' });
        }
    })();
}

export async function postDiscordEmbed(webhookUrl: string, embed: any): Promise<void> {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (err) {
        logger.error(`Webhook error: ${err}`, { prefix: 'DISCORD' });
    }
}

export async function postBotEmbed(channelId: string, embed: any): Promise<void> {
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return;
    await postDiscordBotMessage(channelId, { embeds: [embed] });
}

export async function logAdminEvent(message: string): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_ADMIN_LOG_CHANNEL_ID');
    if (!channelId) return;
    await postDiscordBotMessage(channelId, { content: message });
}

export async function logGeneralEvent(message: string): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_ADMIN_LOG_CHANNEL_ID');
    if (!channelId) return;
    await postDiscordBotMessage(channelId, { content: message });
}

export async function logGeneralEmbed(embed: any): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_SERVER_BROWSER_CHANNEL_ID');
    const botToken = await getDiscordBotToken();
    if (channelId && botToken) {
        await postDiscordBotMessage(channelId, { embeds: [embed] });
    }
}

export async function logServersEmbed(embed: any): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_SERVER_BROWSER_CHANNEL_ID');
    const botToken = await getDiscordBotToken();
    if (channelId && botToken) {
        await postDiscordBotMessage(channelId, { embeds: [embed] });
    }
}

let lastServersChannelName = '';
export async function updateServersCountChannel(count: number): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_SERVER_COUNT_CHANNEL_ID');
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return;
    const desiredName = `servers online: ${count}`;
    if (desiredName === lastServersChannelName) return;
    try {
        const endpoint = `channels:${channelId}`;
        const resp = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: desiredName })
            },
            endpoint
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            logger.error(`Failed to update Discord channel name: ${resp.status} ${errorText}`, { prefix: 'DISCORD' });
            return;
        }
        lastServersChannelName = desiredName;
    } catch (err) {
        logger.error(`Error updating channel name: ${err}`, { prefix: 'DISCORD' });
    }
}

let lastPlayersChannelName = '';
export async function updatePlayersCountChannel(count: number): Promise<void> {
    const channelId = await getDiscordConfig('DISCORD_PLAYER_COUNT_CHANNEL_ID');
    const botToken = await getDiscordBotToken();
    if (!channelId || !botToken) return;
    const desiredName = `players online: ${count}`;
    if (desiredName === lastPlayersChannelName) return;
    try {
        const endpoint = `channels:${channelId}`;
        const resp = await queueDiscordRequest(
            `https://discord.com/api/v10/channels/${channelId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: desiredName })
            },
            endpoint
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            logger.error(`Failed to update players channel name: ${resp.status} ${errorText}`, { prefix: 'DISCORD' });
            return;
        }
        lastPlayersChannelName = desiredName;
    } catch (err) {
        logger.error(`Error updating players channel name: ${err}`, { prefix: 'DISCORD' });
    }
}


