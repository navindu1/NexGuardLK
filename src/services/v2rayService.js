// File Path: src/services/v2rayService.js

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto"); 

const rawPanelUrl = process.env.PANEL_URL || "";
const PANEL_URL = rawPanelUrl.replace(/\/$/, ""); 
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN;

const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/clients/add`;  // 3x-ui හි නිවැරදි Endpoint එක
const ADD_GROUP_URL = `${PANEL_URL}/panel/api/clients/groups/bulkAdd`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const UPDATE_CLIENT_URL = (uuid) => `${PANEL_URL}/panel/api/inbounds/updateClient/${uuid}`;
const RESET_TRAFFIC_URL = (inboundId, email) => `${PANEL_URL}/panel/api/inbounds/${inboundId}/resetClientTraffic/${email}`;

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

// --- ප්‍රධාන වෙනස: Usage Data (clientStats) එකවරම Cache එකට ගැනීම ---
async function refreshClientCache() {
    if (cacheFetchPromise) return cacheFetchPromise;

    cacheFetchPromise = (async () => {
        try {
            const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
                headers: getApiHeaders(),
                timeout: 20000  // <--- 5000 යන්න 20000 ලෙස වෙනස් කරන්න
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
                const clientStats = inbound.clientStats || []; // අලුත්: Panel එකෙන්ම Usage ගෙනීම
                
                for (const client of clients) {
                    if (client && client.email) {
                        // මේ client ට අදාළ usage data හොයාගැනීම
                        const stats = clientStats.find(s => s.email === client.email) || {};
                        
                        // Client දත්ත සහ Usage දත්ත එකට සම්බන්ධ කිරීම
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

    // වෙනම API Request යැවීම ඉවත් කර ඇත. දත්ත කෙළින්ම Cache එකෙන් යවයි! (Error එන්නේ නැත)
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

        // 3x-ui Panel API එක බලාපොරොත්තු වන නිවැරදි Data Format එක
        const payload = {
            client: {
                id: clientSettings.id, // UUID
                email: clientSettings.email,
                totalGB: clientSettings.totalGB || 0,
                expiryTime: clientSettings.expiryTime || 0,
                limitIp: clientSettings.limitIp || 1,
                tgId: clientSettings.tgId ? parseInt(clientSettings.tgId) : 0,
                subId: clientSettings.subId,
                enable: clientSettings.enable !== false,
                group: clientSettings.group || ""
            },
            inboundIds: [ parseInt(inboundId) ] // Array එකක් ලෙස යැවිය යුතුය
        };

        console.log(`[V2Ray API] Adding client via 3x-ui Endpoint: ${ADD_CLIENT_URL}`);
        
        const { data } = await axios.post(ADD_CLIENT_URL, payload, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        if (error.response) {
            console.error(`[V2Ray API Error] Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data));
        } else {
            console.error('[V2Ray API Error] Add Client failed:', error.message);
        }
        throw new Error("Failed to add client to V2Ray panel."); 
    }
};

exports.addClientToGroup = async (groupName, uuid) => {
    try {
        // 3x-ui සම්මත Payload එක
        const payload = {
            groupName: groupName,
            clientIds: [uuid] 
        };
        
        console.log(`[V2Ray API] Adding client ${uuid} to group: '${groupName}'`);
        const { data } = await axios.post(ADD_GROUP_URL, payload, { headers: getApiHeaders() });
        return data;
    } catch (error) {
        if (error.response) {
            console.error(`[V2Ray API Error] Group Add failed:`, JSON.stringify(error.response.data));
        } else {
            console.error('[V2Ray API Error] Group Add failed:', error.message);
        }
        // Group එකට Add වීම අසාර්ථක වුණත් සම්පූර්ණ Order එක fail නොවීමට මෙය return false කරයි
        return { success: false }; 
    }
};

exports.deleteClient = async (inboundId, clientUuid) => {
    try {
        const url = DEL_CLIENT_BY_UUID_URL(inboundId, clientUuid);
        const { data } = await axios.post(url, {}, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Delete Client failed:', error.message);
        throw new Error("Failed to delete client from V2Ray panel.");
    }
};

exports.updateClient = async (inboundId, clientUuid, clientSettings) => {
    try {
        if (!clientSettings.subId) {
            clientSettings.subId = crypto.randomBytes(8).toString('hex');
        }

        const payload = {
            id: parseInt(inboundId),
            settings: JSON.stringify({ clients: [clientSettings] })
        };
        const url = UPDATE_CLIENT_URL(clientUuid);
        const { data } = await axios.post(url, payload, { headers: getApiHeaders() });
        
        if (data && data.success) invalidateCache(); 
        return data;
    } catch (error) {
        console.error('[V2Ray API Error] Update Client failed:', error.message);
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
        console.error(`VLESS template is invalid.`);
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
