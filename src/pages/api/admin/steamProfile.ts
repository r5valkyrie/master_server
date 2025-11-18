import type { APIRoute } from 'astro';
import axios from 'axios';

export interface SteamPlayerProfile {
  steamid: string;
  communityvisibilitystate: number;
  profilestate: number;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarhash: string;
  lastlogoff?: number;
  personastate: number;
  realname?: string;
  primaryclanid?: string;
  timecreated?: number;
  personastateflags?: number;
  loccountrycode?: string;
  locstatecode?: string;
  loccityid?: number;
  gameextrainfo?: string;
  gameid?: string;
  gameserverip?: string;
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const steamId = url.searchParams.get('steamid');
    
    if (!steamId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Steam ID is required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate Steam ID format (Steam ID 64 is 17 digits starting with 765611)
    if (!/^765611\d{11}$/.test(steamId)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid Steam ID format' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Steam API key not configured' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Fetch player summary
      const summaryResponse = await axios.get(
        'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
        {
          params: {
            key: apiKey,
            steamids: steamId
          },
          timeout: 5000
        }
      );

      const players = summaryResponse.data?.response?.players;
      if (!players || !Array.isArray(players) || players.length === 0) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Steam profile not found' 
        }), { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const profile: SteamPlayerProfile = players[0];

      // Fetch additional player bans info
      let banInfo = null;
      try {
        const banResponse = await axios.get(
          'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/',
          {
            params: {
              key: apiKey,
              steamids: steamId
            },
            timeout: 5000
          }
        );

        const banPlayers = banResponse.data?.players;
        if (banPlayers && Array.isArray(banPlayers) && banPlayers.length > 0) {
          banInfo = banPlayers[0];
        }
      } catch (error) {
        console.warn('Failed to fetch Steam ban info:', error);
        // Continue without ban info - it's not critical
      }

      // Format the response data
      const responseData = {
        success: true,
        profile: {
          steamid: profile.steamid,
          personaname: profile.personaname,
          realname: profile.realname || null,
          profileurl: profile.profileurl,
          avatar: profile.avatar,
          avatarmedium: profile.avatarmedium,
          avatarfull: profile.avatarfull,
          personastate: profile.personastate,
          communityvisibilitystate: profile.communityvisibilitystate,
          profilestate: profile.profilestate,
          lastlogoff: profile.lastlogoff ? new Date(profile.lastlogoff * 1000).toISOString() : null,
          timecreated: profile.timecreated ? new Date(profile.timecreated * 1000).toISOString() : null,
          loccountrycode: profile.loccountrycode || null,
          locstatecode: profile.locstatecode || null,
          gameextrainfo: profile.gameextrainfo || null,
          gameid: profile.gameid || null,
          gameserverip: profile.gameserverip || null
        },
        banInfo: banInfo ? {
          communityBanned: banInfo.CommunityBanned,
          vacBanned: banInfo.VACBanned,
          numberVACBans: banInfo.NumberOfVACBans,
          daysSinceLastBan: banInfo.DaysSinceLastBan,
          numberGameBans: banInfo.NumberOfGameBans,
          economyBan: banInfo.EconomyBan
        } : null
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (apiError) {
      console.error('Steam API error:', apiError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch Steam profile data' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Steam profile API error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
