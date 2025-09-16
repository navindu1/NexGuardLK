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
// ===== NEW: Endpoint for updating a client =====
const UPDATE_CLIENT_URL = (uuid) => `${PANEL_URL}/panel/api/inbounds/updateClient/${uuid}`;
// ===== NEW: Endpoint for resetting traffic =====
const RESET_TRAFFIC_URL = (inboundId, email) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/resetClientTraffic/${email}`;


// --- Session Management Object ---
const panelSession = {
    cookie: null,
    lastLogin: 0,
    isValid: function() {
        return this.cookie && (Date.now() - this.lastLogin < 3600000); // 1 hour validity
    }
};

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

/**
 * Finds a V2Ray client by their username (email) across all inbounds.
 */
exports.findV2rayClient = async (username) => {
    // ... (මෙම function එකේ කිසිඳු වෙනසක් සිදු නොකරන්න) ...
    if (typeof username !== "string" || !username) {
        return null;
    }

    const cookie = await getPanelCookie();

    try {
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
            headers: { Cookie: cookie },
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
                    const { data: trafficData } = await axios.get(TRAFFIC_URL, { headers: { Cookie: cookie } });
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
            return this.findV2rayClient(username);
        }
        console.error(`Error in findV2rayClient for ${username}:`, error.message);
        throw error;
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
    const { data } = await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookie } });
    return data;
};

/**
 * Deletes a client from a specified inbound using their UUID.
 */
exports.deleteClient = async (inboundId, clientUuid) => {
    const cookie = await getPanelCookie();
    const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie } });
    return data;
};

// ==========================================================
// ===== NEW FUNCTION: Update an existing V2Ray client ======
// ==========================================================
exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    const cookie = await getPanelCookie();
    const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] })
    };
    const url = UPDATE_CLIENT_URL(clientUuid);
    const { data } = await axios.post(url, payload, { headers: { Cookie: cookie } });
    return data;
};

// =============================================================
// ===== NEW FUNCTION: Reset a client's data usage (traffic) =====
// =============================================================
exports.resetClientTraffic = async (inboundId, clientEmail) => {
    const cookie = await getPanelCookie();
    const url = RESET_TRAFFIC_URL(inboundId, clientEmail);
    // This endpoint usually doesn't require a payload
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie }});
    return data;
}

/**
 * Generates a V2Ray configuration link from a template.
 */
exports.generateV2rayConfigLink = (inboundId, client) => {
    // ... (මෙම function එකේ කිසිඳු වෙනසක් සිදු නොකරන්න) ...
    if (!client || !client.id || !client.email) return null;
    const uuid = client.id;
    const remark = encodeURIComponent(client.email);
    let templateKey;

    const numericInboundId = parseInt(inboundId);
    const configIds = {
        dialog: parseInt(process.env.INBOUND_ID_DIALOG),
        hutch: parseInt(process.env.INBOUND_ID_HUTCH),
        slt_zoom: parseInt(process.env.INBOUND_ID_SLT_ZOOM),
        slt_netflix: parseInt(process.env.INBOUND_ID_SLT_NETFLIX),
        dialog_sim: parseInt(process.env.INBOUND_ID_DIALOG_SIM),
    };
    
    if (numericInboundId === configIds.dialog) templateKey = "VLESS_TEMPLATE_DIALOG";
    else if (numericInboundId === configIds.hutch) templateKey = "VLESS_TEMPLATE_HUTCH";
    else if (numericInboundId === configIds.slt_zoom) templateKey = "VLESS_TEMPLATE_SLT_ZOOM";
    else if (numericInboundId === configIds.slt_netflix) templateKey = "VLESS_TEMPLATE_SLT_NETFLIX";
    else if (numericInboundId === configIds.dialog_sim) templateKey = "VLESS_TEMPLATE_DIALOG_SIM";
    else {
        console.error(`No VLESS template found for inbound ID: ${numericInboundId}`);
        return null;
    }

    const linkTemplate = process.env[templateKey];
    if (!linkTemplate) {
        console.error(`Environment variable for template key "${templateKey}" is not defined.`);
        return null;
    }
    
    return linkTemplate.replace("{uuid}", uuid).replace("{remark}", remark);
};