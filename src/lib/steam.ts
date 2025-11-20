import axios from 'axios';
import { logger } from './logger.ts';

export type SteamAuthResult = {
  steamid: string;
  persona?: string;
};

export async function authenticateSteamTicket(
  ticket: string,
  appId?: string,
  apiKey?: string,
  retryCount: number = 0
): Promise<SteamAuthResult> {
  const key = apiKey || process.env.STEAM_WEB_API_KEY;
  const app = appId || process.env.STEAM_APP_ID || '480'; // Fallback to Spacewar App ID for testing

  if (!key) {
    logger.error('Missing STEAM_WEB_API_KEY environment variable', { prefix: 'STEAM' });
    throw new Error('steam_api_key_missing');
  }
  
  if (!app) {
    logger.error('Missing STEAM_APP_ID environment variable', { prefix: 'STEAM' });
    throw new Error('steam_app_id_missing');
  }
  
  logger.debug(`Environment check - API key exists: ${!!key}, App ID: ${app}`, { prefix: 'STEAM' });
  
  logger.debug(`Using Steam App ID: ${app}`, { prefix: 'STEAM' });
  logger.debug(`Ticket length: ${ticket.length}`, { prefix: 'STEAM' });

  // Steam's AuthenticateUserTicket expects hex ticket
  // Ensure ticket is in uppercase hex format
  const formattedTicket = ticket.toUpperCase();
  logger.debug(`Using hex ticket format for Steam API`, { prefix: 'STEAM' });

  const authResp = await axios.get(
    'https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/',
    {
      params: {
        key: key,
        appid: String(app),
        ticket: formattedTicket
      },
      timeout: 7000,
      validateStatus: () => true,
    }
  );

  logger.debug(`Steam API response status: ${authResp.status}`, { prefix: 'STEAM' });
  logger.debug(`Steam API response received`, { prefix: 'STEAM' });
  
  const authOk = authResp.status === 200 && authResp.data && authResp.data.response && authResp.data.response.params && authResp.data.response.params.steamid;
  if (!authOk) {
    const errMsg = authResp.data?.response?.error?.errordesc || `steam_auth_failed_${authResp.status}`;
    logger.error(`Steam authentication failed: ${errMsg}`, { prefix: 'STEAM' });
    logger.error(`Steam full response error`, { prefix: 'STEAM' });
    
    // Retry once for "Invalid ticket" errors (common Steam timing issue)
    if (errMsg === 'Invalid ticket' && retryCount === 0) {
      logger.debug(`Retrying Steam ticket validation in 2 seconds (attempt ${retryCount + 1}/2)`, { prefix: 'STEAM' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      return authenticateSteamTicket(ticket, appId, apiKey, retryCount + 1);
    }
    
    const e = new Error(errMsg);
    // Attach code for easier upstream handling
    // @ts-ignore
    e.code = 'steam_auth_failed';
    throw e;
  }

  const steamid = String(authResp.data.response.params.steamid);

  let persona: string | undefined = undefined;
  try {
    const summaryResp = await axios.get(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
      {
        params: { key, steamids: steamid },
        timeout: 5000,
        validateStatus: () => true,
      }
    );

    if (
      summaryResp.status === 200 &&
      summaryResp.data &&
      summaryResp.data.response &&
      Array.isArray(summaryResp.data.response.players) &&
      summaryResp.data.response.players.length > 0
    ) {
      persona = summaryResp.data.response.players[0]?.personaname;
    }
  } catch {
    // ignore summary failure, persona is optional
  }

  return { steamid, persona };
}


