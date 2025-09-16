// File Path: src/controllers/adminController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const transporter = require('../config/mailer');
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

exports.approveOrder = async (req, res) => {
    const { orderId } = req.params;
    let finalUsername = ''; // To keep track of the final username for logging

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) return res.status(404).json({ success: false, message: "Order not found." });

        finalUsername = order.username; // Initial username

        const { data: websiteUser, error: userError } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (userError || !websiteUser) return res.status(404).json({ success: false, message: `Website user "${order.website_username}" not found.` });

        const plan = planConfig[order.plan_id];
        let inboundId = inboundIdConfig[order.conn_id];
        if (["slt_fiber", "slt_router"].includes(order.conn_id)) {
            inboundId = order.pkg?.toLowerCase().includes("netflix") ? process.env.INBOUND_ID_SLT_NETFLIX : process.env.INBOUND_ID_SLT_ZOOM;
        }
        if (!inboundId || !plan) return res.status(400).json({ success: false, message: "Invalid plan/connection in order." });

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const newSettings = { enable: true, totalGB: (plan.totalGB || 0) * 1024 * 1024 * 1024, expiryTime };
        let clientLink;
        let updatedActivePlans = websiteUser.active_plans || [];

        if (order.is_renewal) {
            const clientInPanel = await v2rayService.findV2rayClient(order.username);
            if (clientInPanel) {
                inboundId = clientInPanel.inboundId;
                await v2rayService.deleteClient(inboundId, clientInPanel.client.id);
            }
        } else {
            let clientInPanel = await v2rayService.findV2rayClient(finalUsername);
            if (clientInPanel) {
                let counter = 1, newUsername;
                do {
                    newUsername = `${order.username}-${counter++}`;
                } while (await v2rayService.findV2rayClient(newUsername));
                finalUsername = newUsername;
            }
        }
        
        const clientSettings = { id: uuidv4(), email: finalUsername, ...newSettings };
        await v2rayService.addClient(inboundId, clientSettings);
        clientLink = v2rayService.generateV2rayConfigLink(inboundId, clientSettings);

        if(order.is_renewal) {
            const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.username.toLowerCase());
            if (planIndex !== -1) {
                updatedActivePlans[planIndex].activatedAt = new Date().toISOString();
                updatedActivePlans[planIndex].v2rayLink = clientLink;
                updatedActivePlans[planIndex].orderId = order.id;
                // If username was changed due to collision, update it
                updatedActivePlans[planIndex].v2rayUsername = finalUsername;
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