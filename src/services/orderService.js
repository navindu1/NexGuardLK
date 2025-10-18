// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

/**
 * Approves an order. For renewals, it will queue the renewal if the current plan is still active.
 * Otherwise, it creates/updates the V2Ray user immediately.
 *
 * @param {string} orderId - The UUID of the order to approve.
 * @param {boolean} [isAutoConfirm=false] - If true, the order status will be set to 'unconfirmed' instead of 'approved'.
 * @returns {Promise<{success: boolean, message: string, finalUsername?: string}>}
 */
exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null;
    let order = null;

    try {
        const { data: orderData, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !orderData) {
            return { success: false, message: "Order not found." };
        }
        order = orderData;
        
        if (order.status === 'approved' || order.status === 'queued_for_renewal' || order.status === 'unconfirmed') {
            return { success: false, message: `Order is already ${order.status}.` };
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
            .select("total_gb, plan_name") // plan_name is needed for queue details
            .eq("plan_name", order.plan_id)
            .single();

        if (planError || !planDetails) {
            return { success: false, message: `Plan details for "${order.plan_id}" not found in the database.` };
        }

        let clientLink;
        
        // --- START: MODIFIED RENEWAL AND NEW USER LOGIC ---

        if (order.is_renewal) {
            // This is a renewal order.
            const clientInPanel = await v2rayService.findV2rayClient(order.username);
            if (!clientInPanel) {
                return { success: false, message: `Renewal failed: User '${order.username}' not found in the panel.` };
            }

            const now = Date.now();
            const currentExpiryTime = clientInPanel.client.expiryTime || 0;

            if (currentExpiryTime > now) {
                // --- CONDITION A: PLAN IS STILL ACTIVE ---
                // Queue the renewal instead of applying it now.
                console.log(`[Queued Renewal] Plan for ${order.username} is still active. Queuing renewal.`);

                const planDetailsForQueue = {
                    plan_id: planDetails.plan_name,
                    total_gb: planDetails.total_gb,
                    conn_id: order.conn_id,
                    inbound_id: order.inbound_id,
                    vless_template: order.vless_template,
                };
                
                // Insert into the new renewal_queue table
                const { error: queueError } = await supabase.from('renewal_queue').insert({
                    order_id: order.id,
                    v2ray_username: order.username,
                    activation_timestamp: new Date(currentExpiryTime).toISOString(),
                    new_plan_details: planDetailsForQueue,
                });

                if (queueError) {
                    console.error("Failed to insert into renewal_queue:", queueError);
                    throw new Error("Database error while queuing renewal.");
                }

                // Update the order status to 'queued_for_renewal'
                await supabase.from("orders").update({
                    status: 'queued_for_renewal',
                    final_username: order.username // The username doesn't change
                }).eq("id", orderId);

                // Return a specific message to the admin
                return { success: true, message: `Plan is still active. Renewal for ${order.username} has been queued successfully.` };
            
            } else {
                // --- CONDITION B: PLAN HAS EXPIRED ---
                // Renew immediately as before.
                console.log(`[Immediate Renewal] Plan for ${order.username} has expired. Renewing immediately.`);
                const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
                const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;
                
                const updatedClientSettings = {
                    id: clientInPanel.client.id, email: clientInPanel.client.email, total: totalGBValue,
                    expiryTime: expiryTime, enable: true, tgId: clientInPanel.client.tgId || "", subId: clientInPanel.client.subId || ""
                };
                
                await v2rayService.updateClient(inboundId, clientInPanel.client.id, updatedClientSettings);
                await v2rayService.resetClientTraffic(inboundId, clientInPanel.client.email);
                
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                finalUsername = clientInPanel.client.email;
            }
        } else {
            // This is a NEW USER order.
            finalUsername = order.username;
            const allPanelClients = await v2rayService.getAllClients();

            if (allPanelClients.has(finalUsername.toLowerCase())) {
                let counter = 1;
                let newUsername;
                do {
                    newUsername = `${order.username}-${counter++}`;
                } while (allPanelClients.has(newUsername.toLowerCase()));
                finalUsername = newUsername;
                console.log(`[Username Conflict] Generated new unique username: ${finalUsername}`);
            }
            
            const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
            const totalGBfromDB = parseInt(planDetails.total_gb, 10);
            if (isNaN(totalGBfromDB)) {
                console.error(`[CRITICAL] total_gb for plan "${order.plan_id}" is not a valid number. Value was:`, planDetails.total_gb);
            }
            const totalGBValue = (totalGBfromDB || 0) * 1024 * 1024 * 1024;
            console.log(`[DEBUG] Plan: ${order.plan_id}, GB from DB: ${totalGBfromDB}, Final byte value: ${totalGBValue}`);
            
            const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true, limitIp: 1 };
            const addClientResult = await v2rayService.addClient(inboundId, clientSettings);

            if (!addClientResult || !addClientResult.success) {
                throw new Error(`Failed to create V2Ray user in panel: ${addClientResult.msg || 'Unknown panel error.'}`);
            }

            createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
            clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
        }

        // --- END: MODIFIED LOGIC ---

        // This part runs only for IMMEDIATE renewals and NEW users
        if (finalUsername && clientLink) {
            let updatedActivePlans = websiteUser.active_plans || [];
            let planIndex = -1;

            if (order.is_renewal) {
                // For renewals, find the plan by the v2ray username
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === finalUsername.toLowerCase());
            } else if (order.old_v2ray_username) {
                // For plan changes, find by the old username
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.old_v2ray_username.toLowerCase());
            }
            // -- END CHANGE --

            const newPlanDetails = {
                v2rayUsername: finalUsername, v2rayLink: clientLink, planId: order.plan_id, connId: order.conn_id,
                activatedAt: new Date().toISOString(), orderId: order.id,
            };

            if (planIndex !== -1) {
                updatedActivePlans[planIndex] = newPlanDetails;
            } else if (!updatedActivePlans.some(p => p.orderId === order.id)) {
                updatedActivePlans.push(newPlanDetails);
            }

            await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);
        }
        
        const finalStatus = isAutoConfirm ? 'unconfirmed' : 'approved';

        await supabase.from("orders").update({
            status: finalStatus,
            final_username: finalUsername,
            approved_at: new Date().toISOString(),
            auto_approved: order.auto_approved || isAutoConfirm
        }).eq("id", orderId);

        if (finalStatus === 'approved' && websiteUser.email) {
            const mailOptions = { from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`, to: websiteUser.email, subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`, html: generateEmailTemplate( `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`, `Your ${order.plan_id} plan is ready.`, generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername))};
            
            try {
                await transporter.sendMail(mailOptions);
                console.log(`Approval email sent successfully to ${websiteUser.email}`);
            } catch(error) {
                console.error(`FAILED to send approval email:`, error);
            }
        }
        
        // Final cleanup for 'change plan' orders
        if (order.old_v2ray_username) {
            try {
                const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
                if (oldClientData) {
                    await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                    console.log(`[Cleanup] Successfully deleted old user: ${order.old_v2ray_username} after plan change.`);
                }
            } catch (cleanupError) {
                console.error(`[CRITICAL] Failed to clean up old V2Ray user ${order.old_v2ray_username}. Please delete manually. Error: ${cleanupError.message}`);
            }
        }
        
        return { success: true, message: `Order for ${finalUsername} successfully ${finalStatus}.`, finalUsername };

    } catch (error) {
        console.error(`Error processing order ${orderId}:`, error.message, error.stack);

        if (createdV2rayClient) {
            console.log(`[ROLLBACK] An error occurred. Attempting to delete created V2Ray client ${createdV2rayClient.settings.email}...`);
            try {
                await v2rayService.deleteClient(createdV2rayClient.inboundId, createdV2rayClient.settings.id);
                console.log(`[ROLLBACK] Successfully deleted V2Ray client.`);
            } catch (rollbackError) {
                console.error(`[CRITICAL] FAILED TO ROLLBACK V2Ray client. PLEASE DELETE MANUALLY. Error: ${rollbackError.message}`);
            }
        }
        
        return { success: false, message: error.message || "An error occurred during order approval." };
    }
};

// The rest of your orderService.js file (processAutoConfirmableOrders) remains the same.
exports.processAutoConfirmableOrders = async () => {
    // ... no changes needed here ...
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
                    console.log(`[Auto-Confirm] Order ${order.id} processed successfully. Message: ${approvalResult.message}`);
                } else {
                    console.error(`[Auto-Confirm] FAILED to process order ${order.id}. Reason: ${approvalResult.message}`);
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-approval cron job:', error.message);
    }
};