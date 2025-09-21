const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Plan configuration (Can be moved to a separate config file if needed)
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

         if (!user.active_plans || user.active_plans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }
        
        // --- MODIFIED LOGIC START ---
        const verifiedActivePlans = [];
        for (const plan of user.active_plans) {
            const clientExists = await v2rayService.findV2rayClient(plan.v2rayUsername);
            if (clientExists) {
                // If client exists in the panel, keep the plan
                verifiedActivePlans.push(plan);
            } else {
                // If client DOES NOT exist, log it and DO NOT add it to the verified list
                console.log(`[Verification] Plan '${plan.v2rayUsername}' for user ${user.username} not found in panel. Removing.`);
            }
        }

        // If the number of plans has changed, update the user's record in the database
        if (verifiedActivePlans.length !== user.active_plans.length) {
            await supabase
                .from("users")
                .update({ active_plans: verifiedActivePlans })
                .eq("id", user.id);
        }
        
        // If, after verification, there are no active plans left
        if (verifiedActivePlans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }

        return res.json({
            success: true,
            status: "approved",
            activePlans: verifiedActivePlans,
        });
        // --- MODIFIED LOGIC END ---

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
    
    // Basic validation
    if (!v2rayUsername || typeof v2rayUsername !== 'string' || v2rayUsername.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            message: "Valid V2Ray username is required." 
        });
    }

    const trimmedUsername = v2rayUsername.trim();
    
    try {
        console.log(`[Link V2Ray] Starting process for: ${trimmedUsername}`);

        // Step 1: Find client in V2Ray panel with error handling
        let clientData;
        try {
            clientData = await v2rayService.findV2rayClient(trimmedUsername);
            console.log(`[Link V2Ray] V2Ray service response:`, clientData ? 'Found' : 'Not found');
        } catch (v2rayError) {
            console.error(`[Link V2Ray] V2Ray service error: ${v2rayError.message}`);
            return res.status(500).json({ 
                success: false, 
                message: "Unable to connect to V2Ray panel. Please try again later." 
            });
        }

        if (!clientData || !clientData.client || !clientData.inboundId) {
            console.log(`[Link V2Ray] Client not found or missing data: ${trimmedUsername}`);
            return res.status(404).json({ 
                success: false, 
                message: "This V2Ray username was not found in our panel." 
            });
        }

        console.log(`[Link V2Ray] Client found - InboundId: ${clientData.inboundId}`);

        // Step 2: Check existing links with safer query
        let existingLink;
        try {
            const { data, error } = await supabase
                .from("users")
                .select("id, username")
                .not('active_plans', 'is', null);
            
            if (error) throw error;

            // Manual check for existing v2ray username (safer than contains)
            existingLink = data?.find(user => {
                return user.active_plans?.some(plan => 
                    plan.v2rayUsername === trimmedUsername
                );
            });
            
        } catch (existingError) {
            console.error(`[Link V2Ray] Existing link check error: ${existingError.message}`);
            // Continue without blocking - this is not critical
        }

        if (existingLink) {
            console.log(`[Link V2Ray] Already linked to user: ${existingLink.username}`);
            return res.status(409).json({ 
                success: false, 
                message: "This V2Ray account is already linked to another website account." 
            });
        }

        // Step 3: Get current user
        let currentUser;
        try {
            const { data, error } = await supabase
                .from("users")
                .select("active_plans")
                .eq("id", req.user.id)
                .single();

            if (error) throw error;
            currentUser = data;
            
        } catch (userError) {
            console.error(`[Link V2Ray] User fetch error: ${userError.message}`);
            return res.status(500).json({ 
                success: false, 
                message: "Unable to access your account. Please try again." 
            });
        }

        const currentPlans = Array.isArray(currentUser.active_plans) ? currentUser.active_plans : [];
        const inboundId = parseInt(clientData.inboundId);

        console.log(`[Link V2Ray] Searching connections for inboundId: ${inboundId}`);

        // Step 4: Find connection configuration
        let detectedConnId = null;
        let vlessTemplate = null;

        try {
            // Try single-package connections first
            const { data: singleConnections, error: singleError } = await supabase
                .from('connections')
                .select('name, default_vless_template, default_inbound_id, requires_package_choice')
                .eq('default_inbound_id', inboundId)
                .eq('requires_package_choice', false)
                .limit(1);

            if (singleError) {
                console.error(`[Link V2Ray] Single connection query error: ${singleError.message}`);
            } else if (singleConnections && singleConnections.length > 0) {
                const conn = singleConnections[0];
                console.log(`[Link V2Ray] Found single connection: ${conn.name}`);
                detectedConnId = conn.name;
                vlessTemplate = conn.default_vless_template;
            }

            // If not found, try multi-package connections
            if (!detectedConnId) {
                console.log(`[Link V2Ray] Checking packages for inboundId: ${inboundId}`);
                
                const { data: packages, error: packageError } = await supabase
                    .from('packages')
                    .select('template, connection_id, name')
                    .eq('inbound_id', inboundId)
                    .eq('is_active', true)
                    .limit(1);

                if (packageError) {
                    console.error(`[Link V2Ray] Package query error: ${packageError.message}`);
                } else if (packages && packages.length > 0) {
                    const pkg = packages[0];
                    console.log(`[Link V2Ray] Found package: ${pkg.name}`);
                    
                    // Get connection details
                    const { data: connection, error: connError } = await supabase
                        .from('connections')
                        .select('name')
                        .eq('id', pkg.connection_id)
                        .single();

                    if (connError) {
                        console.error(`[Link V2Ray] Connection lookup error: ${connError.message}`);
                    } else if (connection) {
                        console.log(`[Link V2Ray] Found connection: ${connection.name}`);
                        detectedConnId = connection.name;
                        vlessTemplate = pkg.template;
                    }
                }
            }

        } catch (dbError) {
            console.error(`[Link V2Ray] Database error: ${dbError.message}`);
            return res.status(500).json({ 
                success: false, 
                message: "Database error occurred. Please contact support." 
            });
        }

        // Validate connection found
        if (!detectedConnId || !vlessTemplate) {
            console.error(`[Link V2Ray] No connection found for inboundId: ${inboundId}`);
            return res.status(404).json({ 
                success: false, 
                message: `No matching connection configuration found for this V2Ray account (Inbound: ${inboundId}). Please contact support.` 
            });
        }

        // Step 5: Generate config link
        let v2rayLink;
        try {
            v2rayLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
            if (!v2rayLink) throw new Error('Generated link is empty');
            console.log(`[Link V2Ray] Config link generated successfully`);
        } catch (linkError) {
            console.error(`[Link V2Ray] Link generation error: ${linkError.message}`);
            return res.status(500).json({ 
                success: false, 
                message: "Unable to generate configuration link. Please contact support." 
            });
        }

        // Step 6: Detect plan
        let detectedPlanId = "Unlimited";
        const totalBytes = clientData.client.total || 0;
        
        if (totalBytes > 0) {
            const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
            if (planConfig[`${totalGB}GB`]) {
                detectedPlanId = `${totalGB}GB`;
            }
            console.log(`[Link V2Ray] Detected plan: ${detectedPlanId} (${totalGB}GB)`);
        }

        // Step 7: Create and save new plan
        const newPlan = {
            v2rayUsername: clientData.client.email || trimmedUsername,
            v2rayLink: v2rayLink,
            planId: detectedPlanId,
            connId: detectedConnId,
            activatedAt: new Date().toISOString(),
            orderId: "linked-" + uuidv4(),
        };

        const updatedPlans = [...currentPlans, newPlan];

        try {
            const { error: updateError } = await supabase
                .from("users")
                .update({ active_plans: updatedPlans })
                .eq("id", req.user.id);

            if (updateError) throw updateError;

        } catch (updateError) {
            console.error(`[Link V2Ray] User update error: ${updateError.message}`);
            return res.status(500).json({ 
                success: false, 
                message: "Unable to save the linked account. Please try again." 
            });
        }

        console.log(`[Link V2Ray] SUCCESS - User: ${req.user.username}, V2Ray: ${trimmedUsername}, Connection: ${detectedConnId}`);
        
        return res.json({ 
            success: true, 
            message: "Your V2Ray account has been successfully linked!",
            planInfo: {
                username: newPlan.v2rayUsername,
                plan: detectedPlanId,
                connection: detectedConnId
            }
        });
        
    } catch (error) {
        console.error(`[Link V2Ray] CRITICAL ERROR:`, {
            user: req.user?.username || 'Unknown',
            v2rayUsername: trimmedUsername,
            error: error.message,
            stack: error.stack
        });
        
        return res.status(500).json({ 
            success: false, 
            message: "An unexpected error occurred. Please try again later or contact support." 
        });
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
