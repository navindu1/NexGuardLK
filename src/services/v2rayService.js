const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const https = require('https'); 

// --- SSL Certificate Validation Bypass ---
// Panel එකේ SSL අවුලක් තිබුනත් වැඩ කරන්න මේක දාන්න ඕනේ.
const agent = new https.Agent({  
  rejectUnauthorized: false
});

// --- Environment Variables ---
// (Fallback to V2RAY_ prefix if PANEL_URL is not set, just in case)
const PANEL_URL = process.env.PANEL_URL || process.env.V2RAY_PANEL_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.V2RAY_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.V2RAY_PASSWORD;

// --- API Endpoint URLs ---
const LOGIN_URL = `${PANEL_URL}/login`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/inbounds/addClient`;
const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const UPDATE_CLIENT_URL = (uuid) => `${PANEL_URL}/panel/api/inbounds/updateClient/${uuid}`;
const RESET_TRAFFIC_URL = (inboundId, email) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/resetClientTraffic/${email}`;
const GET_INBOUND_URL = (inboundId) => `${PANEL_URL}/panel/api/inbounds/get/${inboundId}`;

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
                httpsAgent: agent, 
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
        const cookie = await getPanelCookie(); 
        
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
            httpsAgent: agent 
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
                        httpsAgent: agent 
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
        }
        console.error(`Error in findV2rayClient for ${username}:`, error.message);
        throw error;
    }
};

/**
 * Get a specific client by Inbound ID and Email.
 * (This is REQUIRED for the Renewal Logic in orderController)
 */
exports.getClient = async (inboundId, email) => {
    try {
        const cookie = await getPanelCookie();
        const url = GET_INBOUND_URL(inboundId);

        const { data } = await axios.get(url, { 
            headers: { Cookie: cookie },
            httpsAgent: agent 
        });

        if (data && data.success) {
            const inbound = data.obj;
            const settings = JSON.parse(inbound.settings);
            
            if (settings.clients) {
                const client = settings.clients.find(c => c.email === email);
                if (client) {
                    return client;
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`Error in getClient (Inbound: ${inboundId}, Email: ${email}):`, error.message);
        return null;
    }
};

exports.addClient = async (inboundId, clientSettings) => {
    const cookie = await getPanelCookie();
    // Ensure clientSettings has the correct structure for your panel
    // Sometimes panels expect specific fields. 
    // If you pass raw settings, make sure it matches what the panel expects.
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

exports.updateClient = async (inboundId, email, data) => {
    // Note: The 'data' parameter here comes from orderController.
    // It contains the updated client object (including new expiry).
    const cookie = await getPanelCookie();
    
    // We construct a client object that matches what the panel expects inside 'settings'
    const clientSettings = {
        id: data.id,           
        email: data.email,     
        enable: data.enable,
        expiryTime: data.expiryTime,
        flow: data.flow || "",
        limitIp: data.limitIp || 0,
        totalGB: data.total || 0
    };

    // Attempt to update via the direct client update endpoint (preferred for X-UI)
    try {
        const url = UPDATE_CLIENT_URL(data.id); // Using UUID to update
        
        // Some panels require the full settings object structure
        const payload = {
            id: parseInt(inboundId),
            settings: JSON.stringify({ clients: [clientSettings] })
        };

        const { data: responseData } = await axios.post(url, payload, { 
            headers: { Cookie: cookie },
            httpsAgent: agent 
        });
        
        if (responseData && responseData.success) return true;
        
    } catch (error) {
        console.warn(`Direct client update failed for ${email}, checking error: ${error.message}`);
    }
    
    return false;
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