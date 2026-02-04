const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Plan configuration (Used for calculating GBs from bytes if needed)
const planConfig = {
    "100GB": { totalGB: 100 },
    "200GB": { totalGB: 200 },
    "300GB": { totalGB: 300 },
    "Unlimited": { totalGB: 0 },
};

// ------------------------------------------------------------------
// 1. Get User Status (Dashboard එකේ පෙන්වන දත්ත)
// ------------------------------------------------------------------
exports.getUserStatus = async (req, res) => {
    try {
        // User දත්ත ලබා ගැනීම
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", req.user.id)
            .single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        
        // Pending Orders තිබේදැයි පරීක්ෂා කිරීම
        const { data: pendingOrders, error: orderError } = await supabase
            .from("orders")
            .select("id")
            .eq("website_username", user.username)
            .eq("status", "pending");
            
        if (orderError) throw orderError;

        // විශේෂ අවස්ථා පරීක්ෂා කිරීම (Pending Orders හෝ Plans නැති අවස්ථා)
        if (pendingOrders && pendingOrders.length > 0 && (!user.active_plans || user.active_plans.length === 0)) {
            return res.json({ success: true, status: "pending" });
        }

        if (!user.active_plans || user.active_plans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }
        
        // --- START: VERIFICATION LOGIC (Active Plans පරීක්ෂා කිරීම) ---
        const allPanelClientsMap = await v2rayService.getAllClientDetails();
        const verifiedActivePlans = [];

        for (const plan of user.active_plans) {
            const v2rayUsernameLower = plan.v2rayUsername.toLowerCase();
            
            // V2Ray Panel එකේ පරිශීලකයා සිටීදැයි තහවුරු කරගැනීම
            if (allPanelClientsMap.has(v2rayUsernameLower)) {
                const clientDetails = allPanelClientsMap.get(v2rayUsernameLower);
                
                // Expiry Time එක යාවත්කාලීන කිරීම
                const enrichedPlan = {
                    ...plan,
                    expiryTime: clientDetails.expiryTime || 0
                };
                verifiedActivePlans.push(enrichedPlan);
            } else {
                // Panel එකේ නැත්නම් Plan එක Expired ලෙස සලකුණු කිරීම
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

// ------------------------------------------------------------------
// 2. Get User Orders (ඇණවුම් ඉතිහාසය)
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 3. Update Profile Picture
// ------------------------------------------------------------------
exports.updateProfilePicture = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file was uploaded." });
    }
    try {
        // පැරණි පින්තූරය ඉවත් කිරීම
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

        // නව පින්තූරය සුරැකීම
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

// ------------------------------------------------------------------
// 4. Link Old V2Ray Account (MANUAL SELECTION MODE)
// ------------------------------------------------------------------
exports.linkV2rayAccount = async (req, res) => {
    // Frontend එකෙන් එවන දත්ත ලබා ගැනීම
    const { v2rayUsername, connectionId, packageId } = req.body;
    
    // STEP 1: මූලික පරීක්ෂාවන් (Validation)
    if (!v2rayUsername || typeof v2rayUsername !== 'string' || v2rayUsername.trim() === '') {
        return res.status(400).json({ success: false, message: "Valid V2Ray username is required." });
    }
    if (!connectionId) {
        return res.status(400).json({ success: false, message: "Please select a connection." });
    }
    if (!packageId) {
        return res.status(400).json({ success: false, message: "Please select a package." });
    }

    const trimmedUsername = v2rayUsername.trim();
    
    try {
        // STEP 2: V2Ray Panel එකේ මෙම Username එක ඇත්තටම තිබේදැයි පරීක්ෂා කිරීම
        console.log(`[Link Request] Checking username: ${trimmedUsername}`);
        const clientData = await v2rayService.findV2rayClient(trimmedUsername);
        
        if (!clientData || !clientData.client || !clientData.inboundId) {
            // Panel එකේ Username එක සොයාගත නොහැකි නම්
            return res.status(404).json({ success: false, message: "This V2Ray username was not found in our panel." });
        }

        // STEP 3: මෙම ගිණුම දැනටමත් වෙනත් අයෙක් Link කර ඇත්දැයි පරීක්ෂා කිරීම
        const { data: existingLinks } = await supabase
            .from("users")
            .select("id, username, active_plans")
            .not('active_plans', 'is', null);

        // වෙනත් අයෙකුගේ Active Plans තුළ මෙම Username එක තිබේදැයි බැලීම
        const alreadyLinked = existingLinks?.find(user => 
            user.active_plans?.some(plan => plan.v2rayUsername.toLowerCase() === trimmedUsername.toLowerCase())
        );

        if (alreadyLinked) {
            return res.status(409).json({ success: false, message: "This V2Ray account is already linked to another website account." });
        }

        // STEP 4: පරිශීලකයා තෝරාගත් Connection සහ Package විස්තර ලබා ගැනීම
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*') // 'packages' join කිරීම අනවශ්‍යයි, package_options JSON එකක් ලෙස තිබේ නම්
            .eq('id', connectionId)
            .single();

        if (connError || !connection) {
            console.error("Connection fetch error:", connError);
            return res.status(404).json({ success: false, message: "Selected connection configuration not found." });
        }

        // Connection එක තුළ ඇති package_options වලින් පරිශීලකයා තෝරාගත් Package එක සොයා ගැනීම
        const availablePackages = connection.package_options || [];
        const selectedPackage = availablePackages.find(p => p.id == packageId);
        
        if (!selectedPackage) {
            return res.status(400).json({ success: false, message: "Invalid package selection for this connection." });
        }

        // STEP 5: V2Ray Configuration Link එක සෑදීම
        // VLESS Template එක ලබා ගැනීම: Package එකට විශේෂ Template එකක් නැත්නම් Connection Default එක ගන්න
        let vlessTemplate = connection.default_vless_template;
        if (selectedPackage.template && selectedPackage.template.length > 5) {
             vlessTemplate = selectedPackage.template;
        }

        if (!vlessTemplate) {
            return res.status(500).json({ success: false, message: "Configuration template missing. Contact support." });
        }

        const v2rayLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
        if (!v2rayLink) throw new Error('Generated link is empty');

        // Plan ID එක සැකසීම (GB ප්‍රමාණය අනුව)
        let detectedPlanId = "Unlimited";
        if (selectedPackage.name.includes("GB")) {
            // "100GB Monthly" -> "100GB"
            detectedPlanId = selectedPackage.name.split(" ")[0]; 
        }

        // STEP 6: පරිශීලකයාගේ Profile එක Update කිරීම (Active Plans වලට එකතු කිරීම)
        const { data: currentUser } = await supabase
            .from("users")
            .select("active_plans")
            .eq("id", req.user.id)
            .single();

        const currentPlans = Array.isArray(currentUser.active_plans) ? currentUser.active_plans : [];
        
        const newPlan = {
            v2rayUsername: clientData.client.email || trimmedUsername,
            v2rayLink: v2rayLink,
            planId: detectedPlanId,
            connId: connection.connection_name || connection.name, // Connection Name
            pkg: selectedPackage.name, // Package Name
            activatedAt: new Date().toISOString(),
            orderId: "linked-manual-" + uuidv4(), // Unique ID for this link action
            linkedMethod: "manual_selection"
        };
    
        const updatedPlans = [...currentPlans, newPlan];

        // Database එක Update කිරීම
        const { error: updateError } = await supabase
            .from("users")
            .update({ active_plans: updatedPlans })
            .eq("id", req.user.id);
            
        if (updateError) throw updateError;
        
        // Success Response
        return res.json({ 
            success: true, 
            message: "Your V2Ray account has been successfully linked with the selected package!"
        });
        
    } catch (error) {
        // දෝෂ වාර්තා කිරීම (Error Logging)
        console.error(`[Link V2Ray] CRITICAL ERROR:`, { 
            user: req.user?.username, 
            v2rayUsername: trimmedUsername, 
            error: error.message, 
            stack: error.stack 
        });
        return res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later or contact support." });
    }
};

// ------------------------------------------------------------------
// 5. Update Password
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 6. Get Tutorials
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 7. Unlink Plan (ගිණුමක් ඉවත් කිරීම)
// ------------------------------------------------------------------
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
        
        // අදාළ Username එක හැර ඉතිරි Plans තෝරා ගැනීම
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