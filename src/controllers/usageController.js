// File Path: src/controllers/usageController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');

exports.checkUsage = async (req, res) => {
    try {
        // URL එකෙන් හෝ Body එකෙන් username එක ගන්න
        const username = req.params.username || req.body.username;
        
        if (!username) {
            return res.status(400).json({ success: false, message: "Username is required." });
        }

        // 1. මුලින්ම Exact Match එකක් තියෙනවද බලන්න (Prefix නැති පරණ අය හෝ සම්පූර්ණ නම ගැහුවොත්)
        let clientData = await v2rayService.findV2rayClient(username);

        // 2. සොයාගත නොහැකි නම්, Prefix දමා පරීක්ෂා කරන්න
        if (!clientData) {
            // Database එකෙන් Settings ලබා ගැනීම
            const { data: settingsData } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'connection_prefixes')
                .single();

            if (settingsData && settingsData.value) {
                let prefixMap = {};
                try {
                    prefixMap = (typeof settingsData.value === 'string') 
                                ? JSON.parse(settingsData.value) 
                                : settingsData.value;
                } catch (e) {
                    console.warn("Error parsing connection_prefixes setting.");
                }

                // හැම Prefix එකක්ම දාලා බලන්න (Loop through prefixes)
                // උදා: Navindu -> DRC_Navindu, ARC_Navindu, etc.
                for (const prefix of Object.values(prefixMap)) {
                     const prefixedUsername = `${prefix}${username}`;
                     const found = await v2rayService.findV2rayClient(prefixedUsername);
                     
                     if (found) {
                         clientData = found;
                         // එකක් හම්බුනොත් Loop එක නවත්වන්න (First match found)
                         break; 
                     }
                }
            }
        }

        if (!clientData) {
            return res.status(404).json({ success: false, message: "User not found or connection error." });
        }

        // Frontend එකට යැවීමට දත්ත සකස් කිරීම
        const { client } = clientData;
        
        // Data Calculation (Bytes to GB/MB logic frontend එකේ හෝ මෙතන කරන්න පුළුවන්)
        // මෙතන අපි raw bytes යවමු, නැත්නම් අවශ්‍ය නම් GB වලට හරවලා යවන්නත් පුළුවන්.
        
        return res.json({
            success: true,
            data: {
                username: client.email,
                total: client.total || 0,
                up: client.up || 0,
                down: client.down || 0,
                expiryTime: client.expiryTime,
                enable: client.enable,
                // අමතර විස්තර
                inboundId: clientData.inboundId,
                status: client.enable ? "Active" : "Disabled"
            }
        });

    } catch (error) {
        console.error("Usage check error:", error.message);
        res.status(500).json({ success: false, message: "Server error while fetching usage." });
    }
};