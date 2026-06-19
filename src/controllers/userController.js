// File Path: src/controllers/userController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Plan configuration
const planConfig = {
    "100GB": { totalGB: 100 },
    "200GB": { totalGB: 200 },
    "300GB": { totalGB: 300 },
    "Unlimited": { totalGB: 0 },
};

// File Path: src/controllers/userController.js
// මේක ඇතුලේ තියෙන exports.getUserStatus එක මේ කෝඩ් එකෙන් Replace කරන්න.

exports.getUserStatus = async (req, res) => {
    try {
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", req.user.id)
            .single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        
        const { data: pendingOrders, error: orderError } = await supabase
            .from("orders")
            .select("id")
            .eq("website_username", user.username)
            .eq("status", "pending");
            
        if (orderError) throw orderError;

        if (pendingOrders && pendingOrders.length > 0 && (!user.active_plans || user.active_plans.length === 0)) {
            return res.json({ success: true, status: "pending" });
        }

        if (!user.active_plans || user.active_plans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }
        
        // --- START: VERIFICATION & AUTO-REMOVE LOGIC ---
        const allPanelClientsMap = await v2rayService.getAllClientDetails();
        const verifiedActivePlans = [];
        let needsDbUpdate = false; // Database එක අප්ඩේට් කරන්න ඕනෙද කියලා බලන Variable එක

        for (const plan of user.active_plans) {
            const v2rayUsernameLower = plan.v2rayUsername.toLowerCase();
            
            if (allPanelClientsMap.has(v2rayUsernameLower)) {
                // පැනල් එකේ තියෙනවා නම් Live Data අරගෙන Update කරනවා
                const clientDetails = allPanelClientsMap.get(v2rayUsernameLower);
                
                verifiedActivePlans.push({
                    ...plan,
                    expiryTime: clientDetails.expiryTime || 0
                });
            } else {
                // පැනල් එකෙන් මකලා නම් මෙතනට එන්නේ.
                // අපි verifiedActivePlans එකට මේක ඇඩ් කරන්නේ නෑ, ඒ නිසා ඔටෝම අයින් වෙනවා.
                needsDbUpdate = true; 
                console.log(`[Status Check] Plan '${plan.v2rayUsername}' not found in panel. Auto-removing from web profile.`);
            }
        }
        
        // පැනල් එකෙන් අයින් කරපු ඒවා ඩේටාබේස් එකෙනුත් සම්පූර්ණයෙන්ම මකා දැමීම 
        if (needsDbUpdate) {
            await supabase.from("users").update({ active_plans: verifiedActivePlans }).eq("id", req.user.id);
        }

        if (verifiedActivePlans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }

        return res.json({
            success: true,
            status: "approved",
            activePlans: verifiedActivePlans,
        });

    } catch (error) {
        console.error(`[Status Check Error] User: ${req.user.username}, Error: ${error.message}`);
        return res.status(500).json({ success: false, message: "Server error during status check." });
    }
};

exports.getUserOrders = async (req, res) => {
    try {
        const { data: userOrders, error } = await supabase
            .from("orders")
            .select("*")
            .eq("website_username", req.user.username)
            .order("created_at", { ascending: false });

        if (error) throw error;

        res.json({ success: true, orders: userOrders || [] });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).json({ success: false, message: "Could not retrieve orders." });
    }
};

exports.updateProfilePicture = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file was uploaded." });
    }
    try {
        const { data: user } = await supabase
            .from("users")
            .select("profile_picture")
            .eq("id", req.user.id)
            .single();

        if (user && user.profile_picture && user.profile_picture.startsWith('uploads/avatars/')) {
            const oldPath = path.join(process.cwd(), 'public', user.profile_picture);
             if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, (err) => {
                    if (err) console.error("Could not delete old avatar:", err.message);
                });
            }
        }

        const filePath = req.file.path.replace(/\\/g, "/").replace("public/", "");
        const { error: updateError } = await supabase
            .from("users")
            .update({ profile_picture: filePath })
            .eq("id", req.user.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            message: "Profile picture updated.",
            filePath: filePath,
        });
    } catch (error) {
        console.error("Profile picture update error:", error);
        res.status(500).json({ success: false, message: "Error updating profile picture." });
    }
};

exports.linkV2rayAccount = async (req, res) => {
    const { v2rayUsername } = req.body;
    
    if (!v2rayUsername || typeof v2rayUsername !== 'string' || v2rayUsername.trim() === '') {
        return res.status(400).json({ success: false, message: "Valid V2Ray username is required." });
    }

    let finalUsername = v2rayUsername.trim();
    
    try {
        let clientData = await v2rayService.findV2rayClient(finalUsername);

        if (!clientData || !clientData.client) {
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
                    console.warn("Error parsing connection_prefixes setting.", e);
                }

                for (const prefix of Object.values(prefixMap)) {
                     const prefixedName = `${prefix}${finalUsername}`;
                     const found = await v2rayService.findV2rayClient(prefixedName);
                     
                     if (found && found.client) {
                         clientData = found;
                         finalUsername = prefixedName; 
                         break; 
                     }
                }
            }
        }

        if (!clientData || !clientData.client || !clientData.inboundId) {
            return res.status(404).json({ success: false, message: "This V2Ray username was not found in our panel." });
        }

        const { data: existingLinks } = await supabase
            .from("users")
            .select("id, username, active_plans")
            .not('active_plans', 'is', null);

        const alreadyLinked = existingLinks?.find(user => 
            user.active_plans?.some(plan => plan.v2rayUsername.toLowerCase() === finalUsername.toLowerCase())
        );

        if (alreadyLinked) {
            return res.status(409).json({ success: false, message: "This V2Ray account is already linked to another website account." });
        }

        const { data: currentUser } = await supabase
            .from("users")
            .select("active_plans")
            .eq("id", req.user.id)
            .single();

        const currentPlans = Array.isArray(currentUser.active_plans) ? currentUser.active_plans : [];
        const inboundId = parseInt(clientData.inboundId);

        let detectedConnId = null;
        let vlessTemplate = null;
        let finalPackage = null;
        const clientUsernameToLower = (clientData.client.email || finalUsername).toLowerCase();

        // --- ULTRA SMART MATCHING LOGIC (Inbound ID Conflict Fix) ---
        const { data: allConnections, error: connError } = await supabase
            .from('connections')
            .select('name, prefix_code, default_vless_template, default_inbound_id, requires_package_choice, packages(name, template, inbound_id)');

        if (connError) throw connError;

        // 1. මුලින්ම අනිවාර්යයෙන්ම Prefix Code එකෙන් Connection එක හොයනවා
        let matchedConn = allConnections?.find(conn => 
            conn.prefix_code && clientUsernameToLower.startsWith(conn.prefix_code.toLowerCase())
        );

        if (matchedConn) {
            detectedConnId = matchedConn.name;
            if (matchedConn.requires_package_choice && matchedConn.packages) {
                finalPackage = matchedConn.packages.find(p => p.inbound_id === inboundId) || matchedConn.packages[0];
                vlessTemplate = finalPackage?.template;
            } else {
                vlessTemplate = matchedConn.default_vless_template;
            }
        } else {
            // 2. Prefix Code එකක් නැත්නම් විතරක් Inbound ID එකෙන් බලනවා (Fallback)
            const possibleConns = allConnections?.filter(c => 
                (c.requires_package_choice === false && c.default_inbound_id === inboundId) ||
                (c.requires_package_choice === true && c.packages?.some(p => p.inbound_id === inboundId))
            );

            if (possibleConns && possibleConns.length === 1) {
                matchedConn = possibleConns[0];
                detectedConnId = matchedConn.name;
                if (matchedConn.requires_package_choice) {
                    finalPackage = matchedConn.packages.find(p => p.inbound_id === inboundId);
                    vlessTemplate = finalPackage?.template;
                } else {
                    vlessTemplate = matchedConn.default_vless_template;
                }
            } else if (possibleConns && possibleConns.length > 1) {
                // ගැටලුව: එකම Inbound ID එකට Connections කිහිපයක් තියෙනවා, ඒත් Prefix Code එකක් නෑ!
                return res.status(400).json({ 
                    success: false, 
                    message: `Connection conflict! Multiple connections share Inbound ID ${inboundId}. Admin must set a 'Connection Code' (Prefix) to accurately link this account.` 
                });
            }
        }

        if (!detectedConnId || !vlessTemplate) {
            return res.status(404).json({ success: false, message: `No matching connection configuration found for this V2Ray account (Inbound: ${inboundId}). Please contact support.` });
        }

        const v2rayLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
        if (!v2rayLink) throw new Error('Generated link is empty');

        let detectedPlanId = "Unlimited";
        const totalBytes = clientData.client.total || 0;
        
        if (totalBytes > 0) {
            const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
            if (planConfig[`${totalGB}GB`]) {
                detectedPlanId = `${totalGB}GB`;
            }
        }

        const newPlan = {
            v2rayUsername: clientData.client.email || finalUsername,
            v2rayLink,
            planId: detectedPlanId,
            connId: detectedConnId,
            pkg: finalPackage ? finalPackage.name : null,
            activatedAt: new Date().toISOString(),
            orderId: "linked-" + uuidv4(),
        };
    
        const updatedPlans = [...currentPlans, newPlan];

        await supabase.from("users").update({ active_plans: updatedPlans }).eq("id", req.user.id);
        
        return res.json({ 
            success: true, 
            message: "Your V2Ray account has been successfully linked!"
        });
        
    } catch (error) {
        console.error(`[Link V2Ray] CRITICAL ERROR:`, { user: req.user?.username, v2rayUsername: finalUsername, error: error.message, stack: error.stack });
        return res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later or contact support." });
    }
};

exports.updatePassword = async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }
    try {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        const { error } = await supabase
            .from("users")
            .update({ password: hashedPassword })
            .eq("id", req.user.id);
        if (error) throw error;
        res.json({ success: true, message: "Password updated successfully!" });
    } catch (error) {
        console.error("Password update error:", error);
        res.status(500).json({ success: false, message: "Error updating password." });
    }
};

exports.getTutorials = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tutorials')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.unlinkPlan = async (req, res) => {
    try {
        const { v2rayUsername } = req.body;
        const userId = req.user ? req.user.id : null; 
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (!v2rayUsername) {
            return res.status(400).json({ success: false, message: 'Username is required.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('active_plans')
            .eq('id', userId)
            .single();
        
        if (error || !user) {
            console.error("DB Error:", error);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const currentPlans = user.active_plans || [];
        
        const updatedPlans = currentPlans.filter(plan => 
            plan.v2rayUsername && plan.v2rayUsername.toLowerCase() !== v2rayUsername.toLowerCase()
        );

        if (currentPlans.length === updatedPlans.length) {
            return res.status(400).json({ success: false, message: 'Plan not found in your account.' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({ active_plans: updatedPlans })
            .eq('id', userId);

        if (updateError) {
            throw updateError;
        }

        return res.json({ success: true, message: 'Plan removed successfully.' });

    } catch (error) {
        console.error("Unlink Critical Error:", error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// --- NEW FUNCTION: Get Software Links ---
exports.getSoftwareLinks = async (req, res) => {
    try {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'software_links')
            .single();
        
        let links = [];
        if (data && data.value) {
            // JSON Parse කරගන්න
            try {
                links = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            } catch (e) {
                console.warn("Error parsing software_links:", e);
                links = [];
            }
        }
        res.json({ success: true, links });
    } catch (error) {
        console.error("Error fetching software links:", error);
        res.status(500).json({ success: false, message: "Error fetching links" });
    }
};

exports.checkV2rayUsername = async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "Username is required" });
    
    try {
        // Panel එකේ මේ නම තියෙනවද බලනවා
        const existingClient = await v2rayService.findV2rayClient(username);
        
        if (existingClient) {
            // දැනටමත් තියෙනවා නම් අහඹු අංකයක් එකතු කරලා Suggest කරනවා
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            const suggestion = `${username}${randomNum}`;
            return res.json({ available: false, suggestion: suggestion });
        }
        
        // කිසිම අවුලක් නැත්නම් Available කියලා යවනවා
        return res.json({ available: true });
    } catch (error) {
        // ඇත්තටම එන Error එක මොකක්ද කියලා ඔයාගේ Backend Terminal (CMD/VS Code) එකේ පෙන්වයි
        console.error("Error checking username:", error.message);
        return res.status(500).json({ error: "Panel API Error. Please check backend connection." });
    }
};