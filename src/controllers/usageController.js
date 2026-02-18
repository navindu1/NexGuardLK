// File Path: src/controllers/usageController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');

// Prefix ඉවත් කරන Helper Function එක
function stripPrefix(username, prefixMap) {
    if (!username) return "";
    // Prefix Map එකේ values (DRC_, ARC_, etc.) අරගෙන බලනවා
    const prefixes = Object.values(prefixMap || {});
    
    for (const prefix of prefixes) {
        if (username.startsWith(prefix)) {
            // Prefix එක හමු වුවහොත් එය කපා ඉවත් කරයි
            return username.slice(prefix.length);
        }
    }
    return username; // Prefix එකක් නැත්නම් තිබ්බ විදිහටම යවයි
}

exports.checkUsage = async (req, res) => {
    try {
        const usernameInput = req.params.username || req.body.username;
        
        if (!usernameInput) {
            return res.status(400).json({ success: false, message: "Username is required." });
        }

        let clientData = null;
        let prefixMap = {};

        // 1. Settings වලින් Prefix Map එක ලබා ගැනීම (Search & Strip දෙකටම ඕන වෙනවා)
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
                console.warn("Error parsing connection_prefixes setting.");
            }
        }

        // 2. මුලින්ම Exact Match බලන්න
        clientData = await v2rayService.findV2rayClient(usernameInput);

        // 3. Exact Match නැත්නම්, Prefix දාලා Search කරන්න
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
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // 4. දත්ත සකස් කිරීම (Response)
        const { client } = clientData;
        
        // Frontend එකට යවද්දි Prefix එක අයින් කරලා යවමු
        const displayUsername = stripPrefix(client.email, prefixMap);

        return res.json({
            success: true,
            data: {
                username: displayUsername, // මෙතන "Navindu" ලෙස පෙනේවි (ASC_Navindu වෙනුවට)
                realUsername: client.email, // Debugging වලට ඕන නම් (ASC_Navindu)
                total: client.total || 0,
                up: client.up || 0,
                down: client.down || 0,
                expiryTime: client.expiryTime,
                enable: client.enable,
                status: client.enable ? "Active" : "Disabled"
            }
        });

    } catch (error) {
        console.error("Usage check error:", error.message);
        res.status(500).json({ success: false, message: "Server error while fetching usage." });
    }
};