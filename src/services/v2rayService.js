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

// --- Session Management Object ---
// global 'cookies' variable එක වෙනුවට මෙම object එක භාවිතා වේ
const panelSession = {
    cookie: null,
    lastLogin: 0,
    // Session එක පැයකට වඩා පැරණි නම්, එය අලුත් කළ යුතුයි
    isValid: function() {
        return this.cookie && (Date.now() - this.lastLogin < 3600000); // 1 hour validity
    }
};

/**
 * Logs into the panel and updates the session object.
 * @returns {Promise<string|null>} The session cookie or null on failure.
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
        panelSession.cookie = null; // Reset cookie on failure
        return null;
    }
}

/**
 * Gets a valid session cookie, logging in again if necessary.
 * This is the main function to use before making any panel API call.
 * @returns {Promise<string>} A valid session cookie.
 * @throws {Error} If panel authentication fails.
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
 * @param {string} username The username to search for.
 * @returns {Promise<object|null>} Client data or null if not found.
 */
exports.findV2rayClient = async (username) => {
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
                // Fetch traffic data for the found client
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
        return null; // Client not found in any inbound
    } catch (error) {
        // If the cookie expired between getPanelCookie() and the API call
        if (error.response?.status === 401 || error.response?.status === 403) {
            console.log("[V2Ray Service] Session expired, attempting to re-authenticate and retry...");
            panelSession.cookie = null; // Force re-login on next attempt
            return this.findV2rayClient(username); // Retry the operation
        }
        console.error(`Error in findV2rayClient for ${username}:`, error.message);
        throw error;
    }
};

/**
 * Adds a new client to a specified inbound.
 * @param {number} inboundId The ID of the inbound.
 * @param {object} clientSettings The settings for the new client.
 * @returns {Promise<object>} The result of the API call.
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
 * @param {number} inboundId The ID of the inbound.
 * @param {string} clientUuid The UUID of the client to delete.
 * @returns {Promise<object>} The result of the API call.
 */
exports.deleteClient = async (inboundId, clientUuid) => {
    const cookie = await getPanelCookie();
    const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
    const { data } = await axios.post(url, {}, { headers: { Cookie: cookie } });
    return data;
};

/**
 * Generates a V2Ray configuration link from a template.
 * @param {number} inboundId The ID of the inbound.
 * @param {object} client The client object containing id (uuid) and email.
 * @returns {string|null} The generated config link or null.
 */
exports.generateV2rayConfigLink = (inboundId, client) => {
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