// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

/**
 * Approves an order, creates/updates the V2Ray user, and updates the database.
 * This function now handles new orders, renewals, plan changes, and failed auto-confirmations.
 *
 * @param {string} orderId - The UUID of the order to approve.
 * @param {boolean} [isAutoConfirm=false] - If true, the order status will be set to 'unconfirmed' instead of 'approved'.
 * @returns {Promise<{success: boolean, message: string, finalUsername?: string}>}
 */
exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null;
    let result = {}; // Define result object to be returned

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) {
            return { success: false, message: "Order not found." };
        }
        
        if (order.status === 'approved') {
            return { success: false, message: "Order is already approved." };
        }

        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;
        
        if (!inboundId || !vlessTemplate) {
            return { success: false, message: `Inbound ID or VLESS Template is missing for this order. Cannot approve.` };
        }

        const { data: websiteUser } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (!websiteUser) {
            return { success: false, message: `Website user "${order.website_username}" not found.` };
        }

        const { data: planDetails, error: planError } = await supabase
            .from("plans")
            .select("total_gb")
            .eq("plan_name", order.plan_id)
            .single();

        if (planError || !planDetails) {
            return { success: false, message: `Plan details for "${order.plan_id}" not found in the database.` };
        }

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;
        let clientLink;
        
        // This logic now runs for both 'pending' and 'unconfirmed' orders to ensure consistency.
        if (order.status === 'pending' || order.status === 'unconfirmed') {
            if (order.is_renewal) {
                const clientInPanel = await v2rayService.findV2rayClient(order.username);
                if (clientInPanel) {
                    const updatedClientSettings = {
                        id: clientInPanel.client.id, email: clientInPanel.client.email, total: totalGBValue,
                        expiryTime: expiryTime, enable: true, tgId: clientInPanel.client.tgId || "", subId: clientInPanel.client.subId || ""
                    };
                    await v2rayService.updateClient(inboundId, clientInPanel.client.id, updatedClientSettings);
                    await v2rayService.resetClientTraffic(inboundId, clientInPanel.client.email);
                    createdV2rayClient = { ...clientInPanel, isRenewal: true };
                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                    finalUsername = clientInPanel.client.email;
                } else {
                    // FIX 1: Stop creating a new user on a failed renewal.
                    return { success: false, message: `Renewal failed: User '${order.username}' not found in the panel. Cannot create a new user during renewal.` };
                }
            } else { // This block is for new users or plan changes
                // FIX 3: Check if a user already exists from a previously failed auto-confirm
                const existingClient = await v2rayService.findV2rayClient(order.username);

                if (existingClient && order.status === 'pending') {
                    console.log(`[Adoption] Adopting existing V2Ray user "${order.username}" for pending order ${order.id}.`);
                    finalUsername = order.username;
                    createdV2rayClient = { settings: existingClient.client, inboundId: existingClient.inboundId, isAdopted: true };
                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, existingClient.client);
                } else {
                    // If no user exists (or it's an 'unconfirmed' order being approved), proceed with creation logic
                    finalUsername = order.username;
                    const allPanelClients = await v2rayService.getAllClients();

                    if (allPanelClients.has(finalUsername.toLowerCase()) && !order.final_username) { // Check if a username collision will happen
                        let counter = 1;
                        let newUsername;
                        do {
                            newUsername = `${order.username}-${counter++}`;
                        } while (allPanelClients.has(newUsername.toLowerCase()));
                        finalUsername = newUsername;
                        console.log(`[Username Conflict] Original username was taken. Generated new unique username: ${finalUsername}`);
                    }
                    
                    if (order.status === 'pending') {
                        const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
                        await v2rayService.addClient(inboundId, clientSettings);
                        createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
                        clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
                    }
                }
            }
        
            // This part only runs if a client was actually created or updated
            if (finalUsername && !clientLink) {
                 const clientData = await v2rayService.findV2rayClient(finalUsername);
                 if (clientData) {
                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientData.client);
                 }
            }

            if (finalUsername && clientLink){
                let updatedActivePlans = websiteUser.active_plans || [];
                const planIndex = order.old_v2ray_username 
                    ? updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.old_v2ray_username.toLowerCase())
                    : -1;

                const newPlanDetails = {
                    v2rayUsername: finalUsername, v2rayLink: clientLink, planId: order.plan_id, connId: order.conn_id,
                    activatedAt: new Date().toISOString(), orderId: order.id,
                };

                if (planIndex !== -1) {
                    updatedActivePlans[planIndex] = newPlanDetails;
                } else {
                    // Avoid adding duplicate plans
                    if (!updatedActivePlans.some(p => p.orderId === order.id)) {
                        updatedActivePlans.push(newPlanDetails);
                    }
                }

                await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);
            }
        } 
        
        // If the order was already processed ('unconfirmed'), just retrieve the existing details
        if (!finalUsername) {
            finalUsername = order.final_username;
        }

        const finalStatus = isAutoConfirm ? 'unconfirmed' : 'approved';

        await supabase.from("orders").update({
            status: finalStatus,
            final_username: finalUsername,
            approved_at: finalStatus === 'approved' ? new Date().toISOString() : null,
            auto_approved: order.auto_approved || isAutoConfirm 
        }).eq("id", orderId);

        if (finalStatus === 'approved' && websiteUser.email) {
            const mailOptions = { from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`, to: websiteUser.email, subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`, html: generateEmailTemplate( `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`, `Your ${order.plan_id} plan is ready.`, generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername))};
            transporter.sendMail(mailOptions).catch(error => console.error(`FAILED to send approval email:`, error));
        }
        
        result = { success: true, message: `Order for ${finalUsername} moved to ${finalStatus}.`, finalUsername };

    } catch (error) {
        console.error(`Error processing order ${orderId} for user ${finalUsername}:`, error.message, error.stack);

        // Rollback V2Ray user creation if it's a new user and an error occurred after creation
        if (createdV2rayClient && !createdV2rayClient.isRenewal && !createdV2rayClient.isAdopted) {
            console.log(`[ROLLBACK] An error occurred after creating V2Ray client ${createdV2rayClient.settings.email}. Attempting to delete client...`);
            try {
                await v2rayService.deleteClient(createdV2rayClient.inboundId, createdV2rayClient.settings.id);
                console.log(`[ROLLBACK] Successfully deleted V2Ray client ${createdV2rayClient.settings.email}.`);
            } catch (rollbackError) {
                console.error(`[CRITICAL] FAILED TO ROLLBACK V2Ray client ${createdV2rayClient.settings.email}. PLEASE DELETE MANUALLY. Error: ${rollbackError.message}`);
            }
        }
        
        return { success: false, message: error.message || "An error occurred during order approval." };
    }

    // FIX 2: Safely delete the old user only after everything else is successful
    if (result.success && order.old_v2ray_username) {
        try {
            const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
            if (oldClientData) {
                await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                console.log(`[Cleanup] Successfully deleted old user: ${order.old_v2ray_username} after plan change.`);
            }
        } catch (cleanupError) {
            // Log this as a critical error for manual intervention, but don't fail the entire operation
            console.error(`[CRITICAL] Failed to clean up old V2Ray user ${order.old_v2ray_username}. Please delete manually. Error: ${cleanupError.message}`);
        }
    }
    
    return result;
};


exports.processAutoConfirmableOrders = async () => {
    try {
        const { data: settings, error: settingsError } = await supabase.from('settings').select('*');
        if (settingsError) throw settingsError;

        const enabledSettings = settings
            .filter(s => s.key.startsWith('auto_approve_') && (s.value === true || s.value === 'true'))
            .map(s => s.key.replace('auto_approve_', ''));

        if (enabledSettings.length === 0) {
            return;
        }

        const tenMinutesAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
        
        const { data: ordersToProcess, error: ordersError } = await supabase
            .from('orders')
            .select('id')
            .eq('status', 'pending')
            .in('conn_id', enabledSettings)
            .lte('created_at', tenMinutesAgo);

        if (ordersError) throw ordersError;

        if (ordersToProcess && ordersToProcess.length > 0) {
            console.log(`[Auto-Confirm] Found ${ordersToProcess.length} order(s) to process.`);

            for (const order of ordersToProcess) {
                console.log(`[Auto-Confirm] Processing order ID: ${order.id}`);
                
                const approvalResult = await exports.approveOrder(order.id, true);

                if (approvalResult.success) {
                    console.log(`[Auto-Confirm] Order ${order.id} successfully moved to 'unconfirmed'. Final username: ${approvalResult.finalUsername}`);
                } else {
                    console.error(`[Auto-Confirm] FAILED to process order ${order.id}. Reason: ${approvalResult.message}`);
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-approval cron job:', error.message);
    }
};