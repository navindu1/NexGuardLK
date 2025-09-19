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
        
        // This logic can be slow if user has many plans. Consider running it as a background job if performance becomes an issue.
        const verifiedActivePlans = [];
        for (const plan of user.active_plans) {
            const clientExists = await v2rayService.findV2rayClient(plan.v2rayUsername);
            if (clientExists) {
                verifiedActivePlans.push(plan);
            } else {
                console.log(`[Verification] Plan '${plan.v2rayUsername}' for user ${user.username} not found in panel. Removing.`);
            }
        }

        if (verifiedActivePlans.length !== user.active_plans.length) {
            await supabase
                .from("users")
                .update({ active_plans: verifiedActivePlans })
                .eq("id", user.id);
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
    if (!v2rayUsername) {
        return res.status(400).json({ success: false, message: "V2Ray username is required." });
    }
    try {
        const clientData = await v2rayService.findV2rayClient(v2rayUsername);
        if (!clientData || !clientData.client) {
            return res.status(404).json({ success: false, message: "This V2Ray username was not found in our panel." });
        }

        const { data: existingLink } = await supabase
            .from("users")
            .select("id")
            .contains("active_plans", [{ v2rayUsername: v2rayUsername }]);

        if (existingLink && existingLink.length > 0) {
            return res.status(409).json({ success: false, message: "This V2Ray account is already linked to another website account." });
        }

        const { data: currentUser } = await supabase
            .from("users")
            .select("active_plans")
            .eq("id", req.user.id)
            .single();

        let currentPlans = currentUser.active_plans || [];
        
        // --- START: CORRECTED LOGIC ---
        const inboundId = clientData.inboundId;
        let detectedConnId = null;
        let vlessTemplate = null;

        // Step 1: Check single-package connections that use 'default_inbound_id'
        const { data: singleConn } = await supabase
            .from('connections')
            .select('name, default_vless_template')
            .eq('default_inbound_id', inboundId)
            .eq('requires_package_choice', false)
            .maybeSingle();

        if (singleConn) {
            detectedConnId = singleConn.name;
            vlessTemplate = singleConn.default_vless_template;
        } else {
            // Step 2: If not found, check multi-package connections by looking in the 'packages' table
            const { data: pkgData } = await supabase
                .from('packages')
                .select('template, connections(name)') // Fetch the package template and its parent connection's name
                .eq('inbound_id', inboundId)
                .maybeSingle();
            
            if (pkgData && pkgData.connections) {
                detectedConnId = pkgData.connections.name;
                vlessTemplate = pkgData.template;
            }
        }

        if (!detectedConnId || !vlessTemplate) {
            return res.status(404).json({ success: false, message: "Could not identify the connection type for this V2Ray user. Please contact support." });
        }

        const v2rayLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
        // --- END OF CORRECTED LOGIC ---

        let detectedPlanId = "Unlimited";
        const totalBytes = clientData.client.total || 0;
        if (totalBytes > 0) {
            const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
            if (planConfig[`${totalGB}GB`]) {
                detectedPlanId = `${totalGB}GB`;
            }
        }

        const newPlan = {
            v2rayUsername: clientData.client.email,
            v2rayLink: v2rayLink,
            planId: detectedPlanId,
            connId: detectedConnId,
            activatedAt: new Date().toISOString(),
            orderId: "linked-" + uuidv4(),
        };
        currentPlans.push(newPlan);

        await supabase
            .from("users")
            .update({ active_plans: currentPlans })
            .eq("id", req.user.id);

        res.json({ success: true, message: "Your V2Ray account has been successfully linked!" });
    } catch (error) {
        console.error("Error linking V2Ray account:", error);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
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
