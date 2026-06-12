// File Path: src/controllers/usageController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');

// Prefix ඉවත් කරන Helper Function එක
function stripPrefix(username, prefixMap) {
    if (!username) return "";
    const prefixes = Object.values(prefixMap || {});
    for (const prefix of prefixes) {
        if (username.startsWith(prefix)) {
            return username.slice(prefix.length);
        }
    }
    return username;
}

exports.checkUsage = async (req, res) => {
    try {
        const usernameInput = req.params.username || req.body.username;
        
        if (!usernameInput) {
            return res.status(400).json({ success: false, message: "Username is required." });
        }

        let clientData = null;
        let prefixMap = {};

        // Settings වලින් Prefix Map එක ලබා ගැනීම
        const { data: settingsData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'connection_prefixes')
            .single();

        if (settingsData && settingsData.value) {
            try {
                prefixMap = (typeof settingsData.value === 'string') 
                            ? JSON.parse(settingsData.value) 
                            : settingsData.value;
            } catch (e) {
                console.error("Failed to parse connection_prefixes");
            }
        }

        // 1. Direct Search
        clientData = await v2rayService.findV2rayClient(usernameInput);

        // 2. Prefix Search
        if (!clientData) {
            for (const prefix of Object.values(prefixMap)) {
                 const prefixedUsername = `${prefix}${usernameInput}`;
                 const found = await v2rayService.findV2rayClient(prefixedUsername);
                 if (found) {
                     clientData = found;
                     break; 
                 }
            }
        }

        if (!clientData) {
            return res.status(404).json({ success: false, message: "User not found in panel." });
        }

        const { client } = clientData;
        const displayUsername = stripPrefix(client.email, prefixMap);

        // අගයන් අනිවාර්යයෙන්ම සංඛ්‍යා (Numbers) බවට පත් කිරීම. හිස් නම් 0 ලෙස සලකයි.
        const totalBytes = parseInt(client.total || client.totalGB || 0, 10);
        const upBytes = parseInt(client.up || 0, 10);
        const downBytes = parseInt(client.down || 0, 10);
        const expiryTime = parseInt(client.expiryTime || 0, 10);
        const isEnable = client.enable !== false; // defaults to true if undefined

        return res.json({
            success: true,
            data: {
                username: displayUsername,
                realUsername: client.email,
                total: totalBytes,
                up: upBytes,
                down: downBytes,
                expiryTime: expiryTime,
                enable: isEnable,
                status: isEnable ? "Active" : "Disabled"
            }
        });

    } catch (error) {
        console.error("Usage check error:", error.message);
        res.status(500).json({ success: false, message: "Server error while fetching usage." });
    }
};