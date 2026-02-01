// File Path: src/controllers/usageController.js

const v2rayService = require('../services/v2rayService');
const supabase = require('../config/supabaseClient');
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

// --- Helper Function: පද්ධතියේ ඇති Rules අනුව Network එක හඳුනාගැනීම ---
async function getDynamicConnectionDetails(remark) {
    try {
        const { data: rules, error } = await supabase.from('network_rules').select('*');
        if (error || !rules) return null;

        const lowerRemark = remark.toLowerCase();
        for (const rule of rules) {
            if (lowerRemark.includes(rule.keyword.toLowerCase())) {
                return rule;
            }
        }
        return null;
    } catch (err) {
        console.error("Error fetching network rules:", err);
        return null;
    }
}

exports.checkUsage = async (req, res) => {
    const username = req.params.username;
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }
    try {
        const clientData = await v2rayService.findV2rayClient(username);
        if (clientData && clientData.client) {
            res.json({ success: true, data: clientData.client });
        } else {
            res.status(404).json({ success: false, message: "User not found in the panel." });
        }
    } catch (error) {
        console.error(`Error checking usage for ${username}:`, error.message);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};

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
        
        const allPanelClientsMap = await v2rayService.getAllClientDetails();
        const verifiedActivePlans = [];

        for (const plan of user.active_plans) {
            const v2rayUsernameLower = plan.v2rayUsername.toLowerCase();
            
            if (allPanelClientsMap.has(v2rayUsernameLower)) {
                const clientDetails = allPanelClientsMap.get(v2rayUsernameLower);
                const enrichedPlan = {
                    ...plan,
                    expiryTime: clientDetails.expiryTime || 0
                };
                verifiedActivePlans.push(enrichedPlan);
            } else {
                verifiedActivePlans.push({
                    ...plan,
                    expiryTime: 0 
                });
            }
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
        console.error(`[Status Check Error] Error: ${error.message}`);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

exports.linkV2rayAccount = async (req, res) => {
    const { v2rayUsername } = req.body;
    
    if (!v2rayUsername || typeof v2rayUsername !== 'string' || v2rayUsername.trim() === '') {
        return res.status(400).json({ success: false, message: "Valid V2Ray username is required." });
    }

    const trimmedUsername = v2rayUsername.trim();
    
    try {
        const clientData = await v2rayService.findV2rayClient(trimmedUsername);
        if (!clientData || !clientData.client || !clientData.inboundId) {
            return res.status(404).json({ success: false, message: "V2Ray username not found." });
        }

        const { data: existingLinks } = await supabase
            .from("users")
            .select("active_plans")
            .not('active_plans', 'is', null);

        const alreadyLinked = existingLinks?.find(u => 
            u.active_plans?.some(p => p.v2rayUsername.toLowerCase() === trimmedUsername.toLowerCase())
        );

        if (alreadyLinked) {
            return res.status(409).json({ success: false, message: "Account already linked." });
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

        // --- Package/Connection Detection ---
        const { data: singleConnections } = await supabase
            .from('connections')
            .select('name, default_vless_template')
            .eq('default_inbound_id', inboundId)
            .eq('requires_package_choice', false)
            .limit(1);

        if (singleConnections && singleConnections.length > 0) {
            detectedConnId = singleConnections[0].name;
            vlessTemplate = singleConnections[0].default_vless_template;
        } else {
            const { data: packages } = await supabase
                .from('packages')
                .select('*, connections(name)')
                .eq('inbound_id', inboundId)
                .eq('is_active', true);

            if (packages && packages.length > 0) {
                finalPackage = packages[0];
                detectedConnId = finalPackage.connections.name;
                vlessTemplate = finalPackage.template;
            }
        }

        if (!detectedConnId || !vlessTemplate) {
            return res.status(404).json({ success: false, message: "No matching connection found." });
        }

        // --- START: DYNAMIC RULE LOGIC (සංශෝධිතයි) ---
        const clientEmail = clientData.client.email || trimmedUsername;
        const netRule = await getDynamicConnectionDetails(clientEmail); 

        let finalSni = "aka.ms"; 
        let finalNetworkName = "Standard Connection";

        if (netRule) {
            finalSni = netRule.sni;
            finalNetworkName = netRule.display_name;
        }

        let v2rayLink = v2rayService.generateV2rayLink(clientData.client, clientData.inbound);

        if (v2rayLink) {
            let [urlPart, fragmentPart] = v2rayLink.split('#');
            if (urlPart.includes('sni=')) {
                urlPart = urlPart.replace(/sni=[^&?#]+/, `sni=${encodeURIComponent(finalSni)}`);
            } else {
                urlPart += (urlPart.includes('?') ? '&' : '?') + `sni=${encodeURIComponent(finalSni)}`;
            }
            v2rayLink = `${urlPart}#${encodeURIComponent(finalNetworkName)}-${clientEmail}`;
        }
        // --- END: DYNAMIC RULE LOGIC ---

        let detectedPlanId = "Unlimited";
        const totalBytes = clientData.client.total || 0;
        if (totalBytes > 0) {
            const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
            if (planConfig[`${totalGB}GB`]) detectedPlanId = `${totalGB}GB`;
        }

        const newPlan = {
            v2rayUsername: clientEmail,
            v2rayLink: v2rayLink,
            networkDisplayName: finalNetworkName,
            planId: detectedPlanId,
            connId: detectedConnId,
            pkg: finalPackage ? finalPackage.name : null,
            activatedAt: new Date().toISOString(),
            orderId: "linked-" + uuidv4(),
        };
    
        const updatedPlans = [...currentPlans, newPlan];
        await supabase.from("users").update({ active_plans: updatedPlans }).eq("id", req.user.id);
        
        return res.json({ success: true, message: "V2Ray account linked successfully!" });
        
    } catch (error) {
        console.error(`[Link Error]:`, error.message);
        return res.status(500).json({ success: false, message: "Unexpected error." });
    }
};

exports.unlinkPlan = async (req, res) => {
    try {
        const { v2rayUsername } = req.body;
        const { data: user } = await supabase.from('users').select('active_plans').eq('id', req.user.id).single();
        const updatedPlans = (user.active_plans || []).filter(p => p.v2rayUsername.toLowerCase() !== v2rayUsername.toLowerCase());
        await supabase.from('users').update({ active_plans: updatedPlans }).eq('id', req.user.id);
        return res.json({ success: true, message: 'Plan removed.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal error.' });
    }
};

exports.updateProfilePicture = async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file." });
    try {
        const filePath = req.file.path.replace(/\\/g, "/").replace("public/", "");
        await supabase.from("users").update({ profile_picture: filePath }).eq("id", req.user.id);
        res.json({ success: true, filePath });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating picture." });
    }
};

exports.updatePassword = async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false });
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await supabase.from("users").update({ password: hashedPassword }).eq("id", req.user.id);
    res.json({ success: true });
};