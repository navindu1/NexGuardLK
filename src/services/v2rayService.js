// File Path: src/services/v2rayService.js

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

// --- Environment Variables ---
const PANEL_URL = process.env.PANEL_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- API Endpoint URLs ---
const LOGIN_URL = `${PANEL_URL}/login`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/inbounds/addClient`;
const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const UPDATE_CLIENT_URL = (uuid) => `${PANEL_URL}/panel/api/inbounds/updateClient/${uuid}`;
const RESET_TRAFFIC_URL = (inboundId, email) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/resetClientTraffic/${email}`;

// --- Caching Variables (Updated) ---
let clientCacheMap = null; // දත්ත ගබඩා කර තබන Map එක
let cacheLastUpdated = 0;  // අවසන් වරට update කළ වේලාව

// FIX: Cache කාලය විනාඩි 5 (300,000ms) සිට තත්පර 15 (15,000ms) දක්වා අඩු කරන ලදි.
// එමගින් Renewal හෝ වෙනස්කම් එසැනින් Profile Page එකේ යාවත්කාලීන වේ.
const CACHE_TTL = 15 * 1000; 

// --- Session Management Object ---
const panelSession = {
    cookie: null,
    lastLogin: 0,
    isValid: function() {
        return this.cookie && (Date.now() - this.lastLogin < 3600000); // 1 hour validity
    }
};

/**
 * Cache එක බලහත්කාරයෙන් ඉවත් කිරීම (අලුත් User කෙනෙක් හැදූ විට හෝ මැකූ විට භාවිතා වේ)
 */
function invalidateCache() {
    clientCacheMap = null;
    cacheLastUpdated = 0;
    console.log("[Cache] Client cache invalidated.");
}

/**
 * Logs into the panel and updates the session object.
 */
async function loginAndGetCookie() {
    console.log(`\n[Panel Login] Attempting to login to panel...`);
    try {
        const response = await axios.post(
            LOGIN_URL,
            { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
            {
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 500,
            }
        );

        if ((response.status === 200 || response.status === 302) && response.headers["set-cookie"]) {
            console.log("✅ [Panel Login] Successfully logged in.");
            panelSession.cookie = response.headers["set-cookie"][0];
            panelSession.lastLogin = Date.now();
            return panelSession.cookie;
        } else {
            throw new Error(`Login failed with status ${response.status}. Check panel credentials.`);
        }
    } catch (error) {
        console.error("❌ [Panel Login] FAILED:", error.message);
        panelSession.cookie = null;
        return null;
    }
}

/**
 * Gets a valid session cookie, logging in again if necessary.
 */
async function getPanelCookie() {
    if (panelSession.isValid()) {
        return panelSession.cookie;
    }
    const newCookie = await loginAndGetCookie();
    if (!newCookie) {
        throw new Error("Panel authentication failed. Could not retrieve a new session cookie.");
    }
    return newCookie;
}
exports.getPanelCookie = getPanelCookie;

/**
 * Internal function to fetch all clients and populate the cache.
 * Optimized: Now refreshes every 15 seconds to keep data current.
 */
async function refreshClientCache() {
    try {
        const cookie = await getPanelCookie();
        // console.log("[Cache] Fetching fresh data from V2Ray panel..."); // Log removed to reduce noise on frequent updates
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
        });

        if (!inboundsData?.success) {
            console.error("[Cache] Failed to fetch data from panel.");
            return new Map();
        }

        const newMap = new Map();
        for (const inbound of inboundsData.obj) {
            const clients = (inbound.settings && JSON.parse(inbound.settings).clients) || [];
            for (const client of clients) {
                if (client && client.email) {
                    // Map එකට දත්ත ඇතුලත් කිරීම: key = lowercase email
                    newMap.set(client.email.toLowerCase(), {
                        client: client,
                        inbound: inbound,
                        inboundId: inbound.id
                    });
                }
            }
        }
        
        clientCacheMap = newMap;
        cacheLastUpdated = Date.now();
        // console.log(`[Cache] Updated with ${newMap.size} clients.`);
        return clientCacheMap;

    } catch (error) {
        console.error(`[Cache] Error refreshing cache:`, error.message);
        return new Map(); // Error එකක් ආවොත් හිස් Map එකක් යවන්න
    }
}

/**
 * Finds a V2Ray client by their username (email) using the CACHE first.
 */
exports.findV2rayClient = async (username) => {
    if (typeof username !== "string" || !username) {
        return null;
    }

    // 1. Check if cache needs refresh (Now checks every 15s)
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }

    const lowerCaseUsername = username.toLowerCase();
    const cachedData = clientCacheMap.get(lowerCaseUsername);

    if (!cachedData) {
        return null;
    }

    // 2. Client found in cache. Now fetch LIVE traffic data separately.
    try {
        const cookie = await getPanelCookie();
        const TRAFFIC_URL = `${PANEL_URL}/panel/api/inbounds/getClientTraffics/${cachedData.client.email}`;
        
        const { data: trafficData } = await axios.get(TRAFFIC_URL, { headers: { Cookie: cookie } });
        
        let clientTraffics = {};
        if (trafficData?.success && trafficData.obj) {
            clientTraffics = trafficData.obj;
        }

        const finalClientData = { ...clientTraffics, ...cachedData.client };
        
        return {
            client: finalClientData,
            inbound: cachedData.inbound,
            inboundId: cachedData.inboundId,
        };

    } catch (trafficError) {
        console.warn(`Could not fetch client traffics for ${username}. Returning cached static data.`);
        return {
            client: cachedData.client, 
            inbound: cachedData.inbound,
            inboundId: cachedData.inboundId,
        };
    }
};

/**
 * Adds a new client to a specified inbound.
 */
exports.addClient = async (inboundId, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    console.log('[V2Ray Service] Adding client:', clientSettings.email);
    const { data } = await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookie } });
    
    if (data.success) {
        invalidateCache(); // Cache එක පරණ නිසා එය ඉවත් කරන්න
    }
    return data;
};

/**
 * Deletes a client from a specified inbound using their UUID.
 */
exports.deleteClient = async (inboundId, clientUuid) => {
    const cookie = await getPanelCookie();
    const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie } });
    
    if (data.success) {
        invalidateCache(); // Cache එක පරණ නිසා එය ඉවත් කරන්න
    }
    return data;
};

exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    const url = UPDATE_CLIENT_URL(clientUuid);
    const { data } = await axios.post(url, payload, { headers: { Cookie: cookie } });
    
    if (data.success) {
        invalidateCache(); // Cache එක පරණ නිසා එය ඉවත් කරන්න
    }
    return data;
};

exports.resetClientTraffic = async (inboundId, clientEmail) => {
    const cookie = await getPanelCookie();
    const url = RESET_TRAFFIC_URL(inboundId, clientEmail);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie }});
    return data;
};

// Optimized for performance using Cache
exports.getAllClients = async () => {
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }
    // Return a Set of emails for fast checking
    return new Set(clientCacheMap.keys());
};

/**
 * NEW FUNCTION: Fetches all clients from Cache.
 * Returns a Map for efficient lookups where: key = lowercase email, value = client object.
 */
exports.getAllClientDetails = async () => {
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }
    
    const simplifiedMap = new Map();
    if(clientCacheMap) {
        for (const [email, data] of clientCacheMap.entries()) {
            simplifiedMap.set(email, data.client);
        }
    }
    return simplifiedMap;
};

exports.generateV2rayLink = (client, inbound) => {
    const uuid = client.id;
    const remark = client.email; // පද්ධතියේ remark එක ලෙස භාවිතා කරන්නේ මෙයයි
    const address = "nexguardlk.store";
    const port = 443;

    let sni = "aka.ms"; // Default SNI
    let displayName = "Connection";

    // Remark එක පරීක්ෂා කර SNI සහ නම තීරණය කිරීම
    if (remark.includes('HBB') || remark.includes('router')) {
        sni = "aka.ms";
        displayName = "Dialog HBB Connection";
    } else if (remark.includes('Sim')) {
        sni = "tiktok.com";
        displayName = "Dialog Sim Connection";
    }

    // Link එක සෑදීම
    const link = `vless://${uuid}@${address}:${port}?type=tcp&encryption=none&security=tls&fp=chrome&alpn=h2%2Chttp%2F1.1&allowInsecure=1&sni=${sni}#${displayName}-${remark}`;
    
    return link;
};