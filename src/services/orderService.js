// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

const planConfig = {
    "100GB": { totalGB: 100 }, "200GB": { totalGB: 200 }, "Unlimited": { totalGB: 0 },
};

exports.approveOrder = async (orderId, isAutoApproved = false) => {
    let finalUsername = ''; 
    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) return { success: false, message: "Order not found." };
        if (order.status === 'approved') return { success: false, message: "Order is already approved." };

        // --- DYNAMIC CONNECTION FETCHING (NEW) ---
        // Fetch connection details from the new 'connections' table instead of a hardcoded config
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('inbound_id, vless_template')
            .eq('name', order.conn_id) // Match based on the name stored in the order
            .single();

        if (connError || !connection) {
            return { success: false, message: `Connection type "${order.conn_id}" is not configured in Settings -> Connections.` };
        }
        
        const inboundId = connection.inbound_id;
        const vlessTemplate = connection.vless_template;
        // --- END OF NEW LOGIC ---

        finalUsername = order.username; 
        const { data: websiteUser } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (!websiteUser) return { success: false, message: `Website user "${order.website_username}" not found.` };

        const plan = planConfig[order.plan_id];
        
        // This check is now more robust
        if (!inboundId || !plan || !vlessTemplate) {
            return { success: false, message: "Invalid plan or connection configuration." };
        }

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const totalGBValue = (plan.totalGB || 0) * 1024 * 1024 * 1024;
        
        let clientLink;
        
        if (order.is_renewal) {
            const clientInPanel = await v2rayService.findV2rayClient(order.username);
            if (clientInPanel) {
                const updatedClientSettings = {
                    id: clientInPanel.client.id, email: clientInPanel.client.email, total: totalGBValue,
                    expiryTime: expiryTime, enable: true, tgId: clientInPanel.client.tgId || "", subId: clientInPanel.client.subId || ""
                };
                await v2rayService.updateClient(clientInPanel.inboundId, clientInPanel.client.id, updatedClientSettings);
                await v2rayService.resetClientTraffic(clientInPanel.inboundId, clientInPanel.client.email);
                // Use the dynamic template from the database
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                finalUsername = clientInPanel.client.email;
            } else {
                // If renewal user not found, create a new one
                const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
                await v2rayService.addClient(inboundId, clientSettings);
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
            }
        } else {
            const clientInPanel = await v2rayService.findV2rayClient(finalUsername);
            if (clientInPanel) {
                let counter = 1, newUsername;
                do { newUsername = `${order.username}-${counter++}`; } while (await v2rayService.findV2rayClient(newUsername));
                finalUsername = newUsername;
            }
            const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
            await v2rayService.addClient(inboundId, clientSettings);
            // Use the dynamic template from the database
            clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
        }
        
        let updatedActivePlans = websiteUser.active_plans || [];
        const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.username.toLowerCase());
        
        if (order.is_renewal && planIndex !== -1) {
            updatedActivePlans[planIndex].activatedAt = new Date().toISOString();
            updatedActivePlans[planIndex].v2rayLink = clientLink;
            updatedActivePlans[planIndex].orderId = order.id;
        } else {
            updatedActivePlans.push({
                v2rayUsername: finalUsername, v2rayLink: clientLink, planId: order.plan_id, connId: order.conn_id,
                activatedAt: new Date().toISOString(), orderId: order.id,
            });
        }
        
        await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);
        await supabase.from("orders").update({
            status: "approved", final_username: finalUsername, approved_at: new Date().toISOString(), auto_approved: isAutoApproved
        }).eq("id", orderId);

        if (websiteUser.email) {
            const mailOptions = { from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`, to: websiteUser.email, subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`, html: generateEmailTemplate( `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`, `Your ${order.plan_id} plan is ready.`, generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername))};
            transporter.sendMail(mailOptions).catch(error => console.error(`FAILED to send approval email:`, error));
        }
        return { success: true, message: `Order for ${finalUsername} processed successfully.`, finalUsername };
    } catch (error) {
        console.error(`Error processing order ${orderId} for user ${finalUsername}:`, error.message, error.stack);
        return { success: false, message: error.message || "An error occurred." };
    }
};

exports.checkAndApprovePendingOrders = async () => {
    try {
        const { data: settings, error: settingsError } = await supabase.from('app_settings').select('*');
        if (settingsError) throw settingsError;

        const enabledSettings = settings.filter(s => s.setting_value === true).map(s => s.setting_key.replace('auto_approve_', ''));

        if (enabledSettings.length === 0) {
            return;
        }

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .in('conn_id', enabledSettings)
            .lte('created_at', tenMinutesAgo);

        if (ordersError) throw ordersError;

        if (orders.length > 0) {
            console.log(`Found ${orders.length} order(s) to auto-approve.`);
            for (const order of orders) {
                console.log(`Auto-approving order ID: ${order.id}`);
                await exports.approveOrder(order.id, true);
            }
        }
    } catch (error) {
        console.error('Error during auto-approval cron job:', error.message);
    }
};