// File Path: src/services/v2rayService.js

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const https = require('https'); // 1. HTTPS library එක import කරගන්න

// --- SSL Certificate Validation Bypass (වැදගත්ම කොටස) ---
// Panel එකේ SSL අවුලක් තිබුනත් වැඩ කරන්න මේක දාන්න ඕනේ.
const agent = new https.Agent({  
  rejectUnauthorized: false
});

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

// --- Session Management Object ---
const panelSession = {
    cookie: null,
    lastLogin: 0,
    isValid: function() {
        return this.cookie && (Date.now() - this.lastLogin < 3600000);
    }
};

/**
 * Logs into the panel and updates the session object.
 */
async function loginAndGetCookie() {
    console.log(`\n[Panel Login] Attempting to login to panel... URL: ${LOGIN_URL}`);
    try {
        const response = await axios.post(
            LOGIN_URL,
            { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
            {
                httpsAgent: agent, // HTTPS Agent එක මෙතනට දැම්මා
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
 * Finds a V2Ray client by their username (email) across all inbounds.
 */
exports.findV2rayClient = async (username) => {
    if (typeof username !== "string" || !username) {
        return null;
    }
    
    try {
        const cookie = await getPanelCookie(); // Cookie එක try block එක ඇතුලට ගත්තා
        
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
            httpsAgent: agent // HTTPS Agent එක මෙතනටත්
        });

        if (!inboundsData?.success) return null;

        const lowerCaseUsername = username.toLowerCase();
        for (const inbound of inboundsData.obj) {
            const clients = (inbound.settings && JSON.parse(inbound.settings).clients) || [];
            const foundClient = clients.find(c => c && c.email && c.email.toLowerCase() === lowerCaseUsername);

            if (foundClient) {
                let clientTraffics = {};
                try {
                    const TRAFFIC_URL = `${PANEL_URL}/panel/api/inbounds/getClientTraffics/${foundClient.email}`;
                    const { data: trafficData } = await axios.get(TRAFFIC_URL, { 
                        headers: { Cookie: cookie },
                        httpsAgent: agent // HTTPS Agent එක මෙතනටත්
                    });
                    if (trafficData?.success && trafficData.obj) {
                        clientTraffics = trafficData.obj;
                    }
                } catch (trafficError) {
                    console.warn(`Could not fetch client traffics for ${username}. Continuing without it.`);
                }
                
                const finalClientData = { ...clientTraffics, ...foundClient };
                return {
                    client: finalClientData,
                    inbound: inbound,
                    inboundId: inbound.id,
                };
            }
        }
        return null;
    } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
            console.log("[V2Ray Service] Session expired, attempting to re-authenticate and retry...");
            panelSession.cookie = null;
            // Retry once logic could be added here, but keep simple for now to avoid infinite loops
        }
        console.error(`Error in findV2rayClient for ${username}:`, error.message);
        throw error;
    }
};

exports.addClient = async (inboundId, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    console.log('[DEBUG V2Ray Payload] Sending payload:', JSON.stringify(payload, null, 2));
    const { data } = await axios.post(ADD_CLIENT_URL, payload, { 
        headers: { Cookie: cookie },
        httpsAgent: agent 
    });
    return data;
};

exports.deleteClient = async (inboundId, clientUuid) => {
    const cookie = await getPanelCookie();
    const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
    const { data } = await axios.post(url, {}, { 
        headers: { Cookie: cookie },
        httpsAgent: agent 
    });
    return data;
};

exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    const url = UPDATE_CLIENT_URL(clientUuid);
    const { data } = await axios.post(url, payload, { 
        headers: { Cookie: cookie },
        httpsAgent: agent 
    });
    return data;
};

exports.resetClientTraffic = async (inboundId, clientEmail) => {
    const cookie = await getPanelCookie();
    const url = RESET_TRAFFIC_URL(inboundId, clientEmail);
    const { data } = await axios.post(url, {}, { 
        headers: { Cookie: cookie },
        httpsAgent: agent 
    });
    return data;
};

exports.getAllClients = async () => {
    try {
        const cookie = await getPanelCookie();
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
            httpsAgent: agent
        });

        if (!inboundsData?.success) return [];

        const allClients = new Set();
        for (const inbound of inboundsData.obj) {
            const clients = (inbound.settings && JSON.parse(inbound.settings).clients) || [];
            for (const client of clients) {
                if (client && client.email) {
                    allClients.add(client.email.toLowerCase());
                }
            }
        }
        return allClients;
    } catch (error) {
         console.error(`Error in getAllClients:`, error.message);
         return new Set();
    }
};

exports.getAllClientDetails = async () => {
    try {
        const cookie = await getPanelCookie();
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
            httpsAgent: agent
        });

        if (!inboundsData?.success) return new Map();

        const allClientsMap = new Map();
        for (const inbound of inboundsData.obj) {
            const clients = (inbound.settings && JSON.parse(inbound.settings).clients) || [];
            for (const client of clients) {
                if (client && client.email) {
                    allClientsMap.set(client.email.toLowerCase(), client);
                }
            }
        }
        return allClientsMap;
    } catch (error) {
         console.error(`Error in getAllClientDetails:`, error.message);
         return new Map();
    }
};

exports.generateV2rayConfigLink = (linkTemplate, client) => {
    if (!linkTemplate || !client || !client.id || !client.email) return null;
    
    const uuid = client.id;
    const remark = encodeURIComponent(client.email);
    
    if (!linkTemplate.includes("{uuid}") || !linkTemplate.includes("{remark}")) {
        console.error(`VLESS template is invalid. It must contain {uuid} and {remark} placeholders.`);
        return null;
    }
    
    return linkTemplate.replace("{uuid}", uuid).replace("{remark}", remark);
};