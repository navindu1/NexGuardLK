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

// --- Caching Variables ---
let clientCacheMap = null;
let cacheLastUpdated = 0;
const CACHE_TTL = 15 * 1000;

const panelSession = {
    cookie: null,
    lastLogin: 0,
    isValid: function() {
        return this.cookie && (Date.now() - this.lastLogin < 3600000);
    }
};

function invalidateCache() {
    clientCacheMap = null;
    cacheLastUpdated = 0;
    console.log("[Cache] Client cache invalidated.");
}

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

async function refreshClientCache() {
    try {
        const cookie = await getPanelCookie();
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
        return clientCacheMap;

    } catch (error) {
        console.error(`[Cache] Error refreshing cache:`, error.message);
        return new Map();
    }
}

exports.findV2rayClient = async (username) => {
    if (typeof username !== "string" || !username) {
        return null;
    }

    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }

    const lowerCaseUsername = username.toLowerCase();
    const cachedData = clientCacheMap.get(lowerCaseUsername);

    if (!cachedData) {
        return null;
    }

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

exports.addClient = async (inboundId, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    const { data } = await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookie } });
    
    if (data.success) {
        invalidateCache();
    }
    return data;
};

exports.deleteClient = async (inboundId, clientUuid) => {
    const cookie = await getPanelCookie();
    const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie } });
    
    if (data.success) {
        invalidateCache();
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
        invalidateCache();
    }
    return data;
};

exports.resetClientTraffic = async (inboundId, clientEmail) => {
    const cookie = await getPanelCookie();
    const url = RESET_TRAFFIC_URL(inboundId, clientEmail);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie }});
    return data;
};

exports.getAllClients = async () => {
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }
    return new Set(clientCacheMap.keys());
};

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

exports.generateV2rayConfigLink = (template, client) => {
    if (!template || !client) return null;
    return template
        .replace('{uuid}', client.id)
        .replace('{remark}', client.email);
};

exports.generateV2rayLink = (client, inbound, dynamicName = "Connection", dynamicSni = "aka.ms") => {
    const uuid = client.id;
    const remark = client.email;
    return `vless://${uuid}@nexguardlk.store:443?type=tcp&encryption=none&security=tls&fp=chrome&alpn=h2%2Chttp%2F1.1&allowInsecure=1&sni=${dynamicSni}#${dynamicName}-${remark}`;
};