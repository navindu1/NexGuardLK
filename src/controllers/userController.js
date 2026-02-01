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
        
        // --- START: VERIFICATION LOGIC ---
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
                // If not in panel, keep it but mark as expired/removed (expiryTime: 0)
                verifiedActivePlans.push({
                    ...plan,
                    expiryTime: 0 
                });
                console.log(`[Status Check] Plan '${plan.v2rayUsername}' not found in panel, keeping as inactive.`);
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
        // --- END: VERIFICATION LOGIC ---

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

// File Path: src/controllers/usageController.js

// --- පවතින Imports වලට පසුව මෙම Helper Function එක එක් කරන්න ---
async function getDynamicConnectionDetails(remark) {
    try {
        const { data: rules, error } = await supabase.from('network_rules').select('*');
        if (error || !rules) return null;

        const lowerRemark = remark.toLowerCase();
        // Remark එකේ keyword එක තිබේදැයි බලයි
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

// --- යාවත්කාලීන කරන ලද linkV2rayAccount function එක ---
exports.linkV2rayAccount = async (req, res) => {
    const { v2rayUsername } = req.body;
    
    if (!v2rayUsername || typeof v2rayUsername !== 'string' || v2rayUsername.trim() === '') {
        return res.status(400).json({ success: false, message: "Valid V2Ray username is required." });
    }

    const trimmedUsername = v2rayUsername.trim();
    
    try {
        const clientData = await v2rayService.findV2rayClient(trimmedUsername);
        if (!clientData || !clientData.client || !clientData.inboundId) {
            return res.status(404).json({ success: false, message: "This V2Ray username was not found in our panel." });
        }

        const { data: existingLinks } = await supabase
            .from("users")
            .select("id, username, active_plans")
            .not('active_plans', 'is', null);

        const alreadyLinked = existingLinks?.find(user => 
            user.active_plans?.some(plan => plan.v2rayUsername.toLowerCase() === trimmedUsername.toLowerCase())
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

        const { data: singleConnections } = await supabase
            .from('connections')
            .select('name, default_vless_template, default_inbound_id, requires_package_choice')
            .eq('default_inbound_id', inboundId)
            .eq('requires_package_choice', false)
            .limit(1);

        if (singleConnections && singleConnections.length > 0) {
            const conn = singleConnections[0];
            detectedConnId = conn.name;
            vlessTemplate = conn.default_vless_template;
        } else {
            const { data: packages, error: packageError } = await supabase
                .from('packages')
                .select('*, connections(id, name)')
                .eq('inbound_id', inboundId)
                .eq('is_active', true);

            if (packageError) throw packageError;

            if (packages && packages.length > 0) {
                if (packages.length === 1) {
                    finalPackage = packages[0];
                } else {
                    const clientUsername = clientData.client.email || trimmedUsername;
                    for (const pkg of packages) {
                        const remarkPart = pkg.template.split('#')[1];
                        if (remarkPart) {
                            const prefix = remarkPart.split('{remark}')[0];
                            if (clientUsername.toLowerCase().startsWith(prefix.toLowerCase())) {
                                finalPackage = pkg;
                                break;
                            }
                        }
                    }
                    if (!finalPackage) finalPackage = packages[0];
                }

                if (finalPackage && finalPackage.connections) {
                    detectedConnId = finalPackage.connections.name;
                    vlessTemplate = finalPackage.template;
                }
            }
        }

        if (!detectedConnId || !vlessTemplate) {
            return res.status(404).json({ success: false, message: `No matching configuration found for Inbound: ${inboundId}.` });
        }

        // --- START: DYNAMIC RULE LOGIC (New) ---
        const clientEmail = clientData.client.email || trimmedUsername;
        const netRule = await getDynamicConnectionDetails(clientEmail);

        let finalSni = "aka.ms"; // Default SNI
        let finalNetworkName = "Standard Connection";

        if (netRule) {
            finalSni = netRule.sni;
            finalNetworkName = netRule.display_name;
        }

        // මුලින්ම පවතින template එකෙන් link එක සාදා ගනී
        let v2rayLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
        
        if (v2rayLink && netRule) {
            // URL කොටස සහ Fragment (#) කොටස වෙන් කර ගනී
            const [urlPart, fragmentPart] = v2rayLink.split('#');
            
            // SNI එක ස්වයංක්‍රීයව replace කිරීම
            let updatedUrl = urlPart;
            if (updatedUrl.includes('sni=')) {
                updatedUrl = updatedUrl.replace(/sni=[^&]+/, `sni=${finalSni}`);
            } else {
                updatedUrl += `&sni=${finalSni}`;
            }

            // නව Config Link එක සාදා ගැනීම (Display Name එක Fragment එකට එක් කරයි)
            v2rayLink = `${updatedUrl}#${finalNetworkName}-${clientEmail}`;
        }
        // --- END: DYNAMIC RULE LOGIC ---

        let detectedPlanId = "Unlimited";
        const totalBytes = clientData.client.total || 0;
        
        if (totalBytes > 0) {
            const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
            if (planConfig[`${totalGB}GB`]) {
                detectedPlanId = `${totalGB}GB`;
            }
        }

        const newPlan = {
            v2rayUsername: clientEmail,
            v2rayLink,
            networkDisplayName: finalNetworkName, // පසුව Usage පෙන්වීමට පහසු වීමට එක් කරන ලදී
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
        console.error(`[Link V2Ray] CRITICAL ERROR:`, { user: req.user?.username, v2rayUsername: trimmedUsername, error: error.message });
        return res.status(500).json({ success: false, message: "An unexpected error occurred." });
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