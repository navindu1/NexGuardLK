// File Path: src/controllers/adminController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const transporter = require('../config/mailer');
const bcrypt = require('bcryptjs');
const { generateEmailTemplate, generateApprovalEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

// Configurations (should be in a centralized config file in a larger app)
const planConfig = {
    "100GB": { totalGB: 100 },
    "200GB": { totalGB: 200 },
    "300GB": { totalGB: 300 },
    "Unlimited": { totalGB: 0 },
};
const inboundIdConfig = {
    dialog: process.env.INBOUND_ID_DIALOG,
    hutch: process.env.INBOUND_ID_HUTCH,
    dialog_sim: process.env.INBOUND_ID_DIALOG_SIM,
};

exports.getDashboardData = async (req, res) => {
    try {
        const { data: orders, error: oError } = await supabase.from("orders").select("*");
        const { data: users, error: uError } = await supabase.from("users").select("id, username, email, whatsapp, active_plans, role");

        if (oError || uError) throw oError || uError;

        const data = {
            stats: {
                pending: orders.filter((o) => o.status === "pending").length,
                approved: orders.filter((o) => o.status === "approved").length,
                rejected: orders.filter((o) => o.status === "rejected").length,
                users: users.length,
            },
            pendingOrders: orders.filter((o) => o.status === "pending").sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
            allOrders: orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            allUsers: users,
        };
        res.json({ success: true, data });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ success: false, message: "Failed to load dashboard data." });
    }
};

// File Path: src/controllers/adminController.js

exports.approveOrder = async (req, res) => {
    const { orderId } = req.params;
    let finalUsername = ''; 

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) return res.status(404).json({ success: false, message: "Order not found." });

        finalUsername = order.username; 

        const { data: websiteUser, error: userError } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (userError || !websiteUser) return res.status(404).json({ success: false, message: `Website user "${order.website_username}" not found.` });

        const plan = planConfig[order.plan_id];
        let inboundId = inboundIdConfig[order.conn_id];
        if (["slt_fiber", "slt_router"].includes(order.conn_id)) {
            inboundId = order.pkg?.toLowerCase().includes("netflix") ? process.env.INBOUND_ID_SLT_NETFLIX : process.env.INBOUND_ID_SLT_ZOOM;
        }
        if (!inboundId || !plan) return res.status(400).json({ success: false, message: "Invalid plan/connection in order." });

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const totalGBValue = (plan.totalGB || 0) * 1024 * 1024 * 1024;
        
        let clientLink;
        let clientInPanel;
        let updatedActivePlans = websiteUser.active_plans || [];

        // ===================================================
        // ===== MODIFIED RENEWAL AND NEW USER LOGIC START =====
        // ===================================================

        if (order.is_renewal) {
            clientInPanel = await v2rayService.findV2rayClient(order.username);
            
            if (clientInPanel) {
                // Client Found - This is a true renewal. Let's UPDATE.
                console.log(`Renewing user: ${order.username}. Updating expiry and data.`);
                
                const updatedClientSettings = {
                    id: clientInPanel.client.id, // KEEP original UUID
                    email: clientInPanel.client.email, // KEEP original email
                    total: totalGBValue,
                    expiryTime: expiryTime,
                    enable: true,
                    // Preserve other settings if they exist
                    tgId: clientInPanel.client.tgId || "",
                    subId: clientInPanel.client.subId || ""
                };

                // Update the client in V2Ray panel
                await v2rayService.updateClient(clientInPanel.inboundId, clientInPanel.client.id, updatedClientSettings);
                
                // Reset the client's traffic usage
                await v2rayService.resetClientTraffic(clientInPanel.inboundId, clientInPanel.client.email);

                // Get the same config link (since UUID hasn't changed)
                clientLink = v2rayService.generateV2rayConfigLink(clientInPanel.inboundId, clientInPanel.client);
                finalUsername = clientInPanel.client.email; // Use the exact email from panel

            } else {
                // Client NOT Found - Treat as a new user, even though it was marked as renewal.
                console.log(`Renewal for ${order.username} requested, but user not in panel. Creating as new.`);
                const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
                await v2rayService.addClient(inboundId, clientSettings);
                clientLink = v2rayService.generateV2rayConfigLink(inboundId, clientSettings);
            }
        } else {
            // This is a completely new order.
            clientInPanel = await v2rayService.findV2rayClient(finalUsername);
            if (clientInPanel) {
                // Username already exists, so add a suffix.
                let counter = 1, newUsername;
                do {
                    newUsername = `${order.username}-${counter++}`;
                } while (await v2rayService.findV2rayClient(newUsername));
                finalUsername = newUsername;
            }
            const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
            await v2rayService.addClient(inboundId, clientSettings);
            clientLink = v2rayService.generateV2rayConfigLink(inboundId, clientSettings);
        }
        
        // =================================================
        // ===== MODIFIED RENEWAL AND NEW USER LOGIC END =====
        // =================================================

        if (order.is_renewal) {
            const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.username.toLowerCase());
            if (planIndex !== -1) {
                updatedActivePlans[planIndex].activatedAt = new Date().toISOString();
                updatedActivePlans[planIndex].v2rayLink = clientLink; // Link might be the same, but update just in case
                updatedActivePlans[planIndex].orderId = order.id;
            } else {
                 // If the user was in the panel but not in the website's active_plans, add them.
                 updatedActivePlans.push({
                    v2rayUsername: finalUsername,
                    v2rayLink: clientLink,
                    planId: order.plan_id,
                    connId: order.conn_id,
                    activatedAt: new Date().toISOString(),
                    orderId: order.id,
                });
            }
        } else {
            updatedActivePlans.push({
                v2rayUsername: finalUsername,
                v2rayLink: clientLink,
                planId: order.plan_id,
                connId: order.conn_id,
                activatedAt: new Date().toISOString(),
                orderId: order.id,
            });
        }
        
        await Promise.all([
            supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id),
            supabase.from("orders").update({ status: "approved", final_username: finalUsername, approved_at: new Date().toISOString() }).eq("id", orderId)
        ]);

        if (websiteUser.email) {
            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`,
                html: generateEmailTemplate(
                    `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`,
                    `Your ${order.plan_id} plan is ready.`,
                    generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername)
                ),
            };
            transporter.sendMail(mailOptions).catch(error => console.error(`FAILED to send approval email to ${websiteUser.email}:`, error));
        }

        res.json({ success: true, message: `Order for ${finalUsername} processed successfully.` });

    } catch (error) {
        console.error(`Error approving order ${orderId} for user ${finalUsername}:`, error.message, error.stack);
        res.status(500).json({ success: false, message: error.message || "An error occurred." });
    }
};

exports.rejectOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
        if (error) throw error;
        res.json({ success: true, message: "Order rejected" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error." });
    }
};

exports.banUser = async (req, res) => {
    const { userId } = req.body;
    try {
        const { data: userToBan, error: findError } = await supabase.from("users").select("active_plans").eq("id", userId).single();
        if(findError) throw findError;

        if (userToBan && userToBan.active_plans) {
            for(const plan of userToBan.active_plans) {
                const clientData = await v2rayService.findV2rayClient(plan.v2rayUsername);
                if (clientData) {
                    await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
                    console.log(`Banned and removed V2Ray user: ${plan.v2rayUsername}`);
                }
            }
        }
        
        const { error: deleteError } = await supabase.from("users").delete().eq("id", userId);
        if (deleteError) throw deleteError;
        
        res.json({ success: true, message: `User ${userId} has been banned.` });
    } catch (error) {
        console.error("Error banning user:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

 

exports.createReseller = async (req, res) => {
    const { username, email, password, whatsapp } = req.body;

    // Validate input
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: "Username, email, and password are required." });
    }

    try {
        // Check if username or email already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .or(`username.eq.${username},email.eq.${email}`)
            .limit(1);

        if (checkError) throw checkError;

        if (existingUser && existingUser.length > 0) {
            return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }

        // Hash the password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Prepare new reseller data
        const newReseller = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            whatsapp: whatsapp || null,
            role: 'reseller', // Set the role to 'reseller'
            profile_picture: "assets/profilePhoto.jpg",
            active_plans: [],
        };

        // Insert new reseller into the database
        const { error: insertError } = await supabase.from('users').insert(newReseller);

        if (insertError) throw insertError;

        res.status(201).json({ success: true, message: 'Reseller account created successfully.' });

    } catch (error) {
        console.error('Error creating reseller:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};