// File Path: src/services/v2rayService.js

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto"); 

const rawPanelUrl = process.env.PANEL_URL || "";
const PANEL_URL = rawPanelUrl.replace(/\/$/, ""); 
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN;

const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/clients/add`;  // 3x-ui Endpoint
const ADD_GROUP_URL = `${PANEL_URL}/panel/api/clients/groups/bulkAdd`;
const RESET_TRAFFIC_URL = (inboundId, email) => `${PANEL_URL}/panel/api/clients/resetTraffic/${email}`;

// --- 3x-ui සඳහා නිවැරදි Update සහ Delete Endpoints ---
const DEL_CLIENT_BY_EMAIL_URL = (email) => `${PANEL_URL}/panel/api/clients/del/${email}`;
const UPDATE_CLIENT_URL = (email) => `${PANEL_URL}/panel/api/clients/update/${email}`;

let clientCacheMap = null; 
let cacheLastUpdated = 0;  
const CACHE_TTL = 15 * 1000; 
let cacheFetchPromise = null;

function invalidateCache() {
    clientCacheMap = null;
    cacheLastUpdated = 0;
    console.log("[Cache] Client cache invalidated.");
}

function getApiHeaders() {
    if (!PANEL_API_TOKEN) {
        console.error("⚠️ [Config Error] PANEL_API_TOKEN is not defined in .env file");
    }
    return {
        "Authorization": `Bearer ${PANEL_API_TOKEN}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };
}

async function refreshClientCache() {
    if (cacheFetchPromise) return cacheFetchPromise;

    cacheFetchPromise = (async () => {
        try {
            const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
                headers: getApiHeaders(),
                timeout: 20000  
            });

            if (!inboundsData?.success) {
                console.error("[Cache] Failed to fetch data from panel. Success is false.");
                return clientCacheMap || new Map();
            }

            const newMap = new Map();
            
            for (const inbound of inboundsData.obj) {
                let settingsObj = {};
                if (inbound.settings) {
                    try {
                        settingsObj = typeof inbound.settings === 'string' 
                            ? JSON.parse(inbound.settings) 
                            : inbound.settings;
                    } catch (parseError) {
                        console.error("[Cache] JSON Parse error for inbound ID:", inbound.id);
                    }
                }
                
                const clients = settingsObj.clients || [];
                const clientStats = inbound.clientStats || []; 
                
                for (const client of clients) {
                    if (client && client.email) {
                        const stats = clientStats.find(s => s.email === client.email) || {};
                        
                        const mergedClient = {
                            ...client,
                            up: stats.up || 0,
                            down: stats.down || 0,
                            total: client.totalGB !== undefined ? client.totalGB : (stats.total || 0)
                        };

                        newMap.set(client.email.toLowerCase(), {
                            client: mergedClient,
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
            return clientCacheMap || null; 
        } finally {
            cacheFetchPromise = null; 
        }
    })();

    return cacheFetchPromise;
}

exports.findV2rayClient = async (username) => {
    if (typeof username !== "string" || !username) return null;

    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }

    if (!clientCacheMap) {
        console.error("[V2Ray] Cache is empty. Panel connection failed.");
        throw new Error("Unable to fetch data from V2Ray Panel"); 
    }

    const lowerCaseUsername = username.toLowerCase().trim();
    
    let cachedData = clientCacheMap.get(lowerCaseUsername);

    if (!cachedData) {
        for (const [email, data] of clientCacheMap.entries()) {
            if (email.includes(`_${lowerCaseUsername}`) || email === lowerCaseUsername) {
                cachedData = data;
                break;
            }
        }
    }

    if (!cachedData) return null;

    return {
        client: cachedData.client,
        inbound: cachedData.inbound,
        inboundId: cachedData.inboundId,
    };
};

exports.addClient = async (inboundId, clientSettings) => {
    try {
        if (!clientSettings.subId) {
            clientSettings.subId = crypto.randomBytes(8).toString('hex');
        }

        const payload = {
            client: {
                id: clientSettings.id, 
                email: clientSettings.email,
                totalGB: clientSettings.totalGB || 0,
                expiryTime: clientSettings.expiryTime || 0,
                limitIp: 2, // IP Limit එක 2 කලා
                tgId: clientSettings.tgId ? parseInt(clientSettings.tgId) : 0,
                subId: clientSettings.subId,
                enable: clientSettings.enable !== false,
                group: clientSettings.group || "",
                comment: clientSettings.comment || "" // Whatsapp අංකය Comment එකට යවනවා
            },
            inboundIds: [ parseInt(inboundId) ] 
        };

        const { data } = await axios.post(ADD_CLIENT_URL, payload, { headers: getApiHeaders() });
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Add Client failed:', error?.response?.data || error.message);
        throw new Error("Failed to add client to V2Ray panel."); 
    }
};

// ... addClientToGroup function එක එහෙම්මම තියන්න ...

exports.deleteClient = async (clientEmail) => {
    try {
        // අලුත් API එකට Email එක යවනවා
        const url = DEL_CLIENT_BY_EMAIL_URL(clientEmail);
        const { data } = await axios.post(url, {}, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Delete Client failed:', error?.response?.data || error.message);
        throw new Error("Failed to delete client from V2Ray panel.");
    }
};

exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    try {
        const payload = {
            id: clientUuid, 
            email: clientSettings.email,
            totalGB: clientSettings.totalGB || 0,
            expiryTime: clientSettings.expiryTime || 0,
            limitIp: 2, // IP Limit එක 2 කලා
            tgId: clientSettings.tgId ? parseInt(clientSettings.tgId) : 0,
            subId: clientSettings.subId || crypto.randomBytes(8).toString('hex'),
            enable: clientSettings.enable !== false,
            group: clientSettings.group || "",
            comment: clientSettings.comment || "" // Whatsapp අංකය Comment එකට යවනවා
        };

        const url = UPDATE_CLIENT_URL(clientSettings.email);
        const { data } = await axios.post(url, payload, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Update Client failed:', error?.response?.data || error.message);
        throw new Error("Failed to update client in V2Ray panel.");
    }
};

exports.addClientToGroup = async (groupName, uuid) => {
    try {
        const payload = { groupName: groupName, clientIds: [uuid] };
        const { data } = await axios.post(ADD_GROUP_URL, payload, { headers: getApiHeaders() });
        return data;
    } catch (error) {
        return { success: false }; 
    }
};

exports.deleteClient = async (clientEmail) => {
    try {
        // අලුත් API එකට Email එක යවනවා
        const url = DEL_CLIENT_BY_EMAIL_URL(clientEmail);
        const { data } = await axios.post(url, {}, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Delete Client failed:', error?.response?.data || error.message);
        throw new Error("Failed to delete client from V2Ray panel.");
    }
};


exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    try {
        const payload = {
            id: clientUuid, 
            email: clientSettings.email,
            totalGB: clientSettings.totalGB || 0,
            expiryTime: clientSettings.expiryTime || 0,
            limitIp: 2, // IP Limit එක 2 කලා
            tgId: clientSettings.tgId ? parseInt(clientSettings.tgId) : 0,
            subId: clientSettings.subId || crypto.randomBytes(8).toString('hex'),
            enable: clientSettings.enable !== false,
            group: clientSettings.group || "",
            comment: clientSettings.comment || "" // Whatsapp අංකය Comment එකට යවනවා
        };

        const url = UPDATE_CLIENT_URL(clientSettings.email);
        const { data } = await axios.post(url, payload, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Update Client failed:', error?.response?.data || error.message);
        throw new Error("Failed to update client in V2Ray panel.");
    }
};

exports.resetClientTraffic = async (inboundId, clientEmail) => {
    try {
        const url = RESET_TRAFFIC_URL(inboundId, clientEmail);
        const { data } = await axios.post(url, {}, { headers: getApiHeaders() });
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Reset Traffic failed:', error.message);
        throw new Error("Failed to reset traffic.");
    }
};

exports.getAllClients = async () => {
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }
    return new Set(clientCacheMap ? clientCacheMap.keys() : []);
};

exports.getAllClientDetails = async () => {
    if (!clientCacheMap || (Date.now() - cacheLastUpdated > CACHE_TTL)) {
        await refreshClientCache();
    }
    
    const simplifiedMap = new Map();
    if (clientCacheMap) {
        for (const [email, data] of clientCacheMap.entries()) {
            simplifiedMap.set(email, data.client);
        }
    }
    return simplifiedMap;
};

exports.generateV2rayConfigLink = (linkTemplate, client) => {
    if (!linkTemplate || !client || !client.id || !client.email) return null;
    
    const uuid = client.id;
    const remark = encodeURIComponent(client.email);
    
    if (!linkTemplate.includes("{uuid}") || !linkTemplate.includes("{remark}")) {
        return null;
    }
    
    return linkTemplate.replace("{uuid}", uuid).replace("{remark}", remark);
};

exports.generateAllNetworkLinks = (client, serverIp, port = 443, path = "/vless") => {
    if (!client || !client.id || !client.email) return null;

    const uuid = client.id;
    const email = client.email;

    const networkConfigs = [
        { name: "Dialog Router Connection", sni: "dialog.router.bug.com", host: "dialog.router.bug.com" },
        { name: "Dialog Sim Connection", sni: "dialog.sim.bug.com", host: "dialog.sim.bug.com" },
        { name: "Airtel Sim Connection", sni: "airtel.sim.bug.com", host: "airtel.sim.bug.com" }
    ];

    const generatedLinks = [];

    networkConfigs.forEach(net => {
        const remark = encodeURIComponent(`${email} - ${net.name}`);
        const link = `vless://${uuid}@${serverIp}:${port}?type=ws&security=tls&path=${path}&sni=${net.sni}&host=${net.host}#${remark}`;
        
        generatedLinks.push({ networkName: net.name, link: link });
    });

    return generatedLinks; 
};