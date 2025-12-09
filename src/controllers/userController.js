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
        
        // --- START: NEW VERIFICATION AND CLEANUP LOGIC (UPDATED) ---

        // 1. Fetch all client details from the V2Ray panel
        const allPanelClientsMap = await v2rayService.getAllClientDetails();
        
        const verifiedActivePlans = [];
        let plansChanged = false; // Flag to track if we need to update DB

        // 2. Loop through each plan stored in our database for the user.
        for (const plan of user.active_plans) {
            const v2rayUsernameLower = plan.v2rayUsername.toLowerCase();
            
            // 3. Check if the plan's username exists in the live data from the V2Ray panel.
            if (allPanelClientsMap.has(v2rayUsernameLower)) {
                // If it exists, get the live details from the panel.
                const clientDetails = allPanelClientsMap.get(v2rayUsernameLower);
                
                // Add live data like expiryTime to the plan object to show the user.
                const enrichedPlan = {
                    ...plan,
                    expiryTime: clientDetails.expiryTime || 0
                };
                verifiedActivePlans.push(enrichedPlan);
            } else {
                // 4. If NOT in panel, DO NOT add to verifiedActivePlans
                // This effectively removes it from the list
                plansChanged = true; 
                console.log(`[Status Check] Plan '${plan.v2rayUsername}' not found in panel. Removing from profile.`);
            }
        }

        // 5. If plans were removed (plansChanged is true), update the database
        if (plansChanged) {
            // Remove 'expiryTime' (temporary field) before saving to DB
            const plansToSave = verifiedActivePlans.map(({ expiryTime, ...rest }) => rest);
            
            await supabase
                .from("users")
                .update({ active_plans: plansToSave })
                .eq("id", user.id);
                
            console.log(`[Status Check] Sync complete. User ${user.username}'s profile updated.`);
        }
        
        if (verifiedActivePlans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }

        // 6. Return only the valid plans (including those missing from panel) to the user.
        return res.json({
            success: true,
            status: "approved",
            activePlans: verifiedActivePlans,
        });
        // --- END: NEW VERIFICATION AND CLEANUP LOGIC ---

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
                        const remark = pkg.template.split('#')[1];
                        if (remark) {
                            const prefix = remark.split('{remark}')[0];
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
        v2rayUsername: clientData.client.email || trimmedUsername,
        v2rayLink,
        planId: detectedPlanId,
        connId: detectedConnId,
        pkg: finalPackage ? finalPackage.name : null, // <--- ADD THIS LINE
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
        console.error(`[Link V2Ray] CRITICAL ERROR:`, { user: req.user?.username, v2rayUsername: trimmedUsername, error: error.message, stack: error.stack });
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