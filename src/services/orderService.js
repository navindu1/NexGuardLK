// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

/**
 * Approves an order. For renewals, it will queue the renewal if the current plan is still active.
 * Otherwise, it creates/updates the V2Ray user immediately.
 * Handles manual approval of 'unconfirmed' orders by skipping V2Ray creation and just finalizing.
 *
 * @param {string} orderId - The UUID of the order to approve.
 * @param {boolean} [isAutoConfirm=false] - If true, the order status will be set to 'unconfirmed' instead of 'approved'.
 * @returns {Promise<{success: boolean, message: string, finalUsername?: string}>}
 */
exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null; // To track if a client was newly created for potential rollback
    let order = null;

    try {
        // Fetch the order details
        const { data: orderData, error: orderError } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

        if (orderError || !orderData) {
            return { success: false, message: "Order not found." };
        }
        order = orderData;

        // Check if the order is already in a final state (approved) or queued (cannot be manually approved)
        if (order.status === 'approved' || order.status === 'queued_for_renewal') {
            return { success: false, message: `Order is already ${order.status}.` };
        }

        // Extract necessary details from the order
        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;

        if (!inboundId || !vlessTemplate) {
            return { success: false, message: `Inbound ID or VLESS Template is missing for this order. Cannot approve.` };
        }

        // Fetch the website user associated with the order
        const { data: websiteUser, error: userFetchError } = await supabase
            .from("users")
            .select("*")
            .ilike("username", order.website_username)
            .single();

        if (userFetchError || !websiteUser) {
            console.error(`Website user fetch error for order ${orderId}:`, userFetchError);
            return { success: false, message: `Website user "${order.website_username}" associated with this order was not found.` };
        }

        // Fetch plan details (like total_gb) needed for V2Ray client setup
        const { data: planDetails, error: planError } = await supabase
            .from("plans")
            .select("total_gb, plan_name")
            .eq("plan_name", order.plan_id)
            .single();

        if (planError || !planDetails) {
            return { success: false, message: `Plan details for "${order.plan_id}" not found in the database.` };
        }

        let clientLink;

        if (order.status === 'pending') {
            // --- Logic for Processing 'pending' Orders ---
            console.log(`[Order Processing] Status is 'pending' for order ${orderId}. Proceeding with V2Ray operations.`);

            if (order.is_renewal) {
                // --- Renewal Logic (UNCHANGED) ---
                const clientInPanel = await v2rayService.findV2rayClient(order.username);
                if (!clientInPanel) {
                    return { success: false, message: `Renewal failed: User '${order.username}' not found in the panel.` };
                }

                const now = Date.now();
                const currentExpiryTime = clientInPanel.client.expiryTime || 0;
                
                const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;

                if (currentExpiryTime > now) {
                    // --- CONDITION A: PLAN IS STILL ACTIVE (Queue Renewal) ---
                    console.log(`[Queued Renewal] Plan for ${order.username} (Order: ${orderId}) is still active. Queuing renewal.`);
                    
                    const planDetailsForQueue = {
                        plan_id: order.plan_id,
                        conn_id: order.conn_id,
                        inbound_id: inboundId,
                        vless_template: vlessTemplate,
                        pkg: order.pkg,
                        total_gb: planDetails.total_gb
                    };
                    
                    const { error: queueError } = await supabase.from('renewal_queue').insert({
                        order_id: orderId,
                        v2ray_username: order.username,
                        activation_timestamp: new Date(currentExpiryTime).toISOString(),
                        new_plan_details: planDetailsForQueue
                    });

                    if (queueError) {
                        console.error('Failed to add to renewal queue:', queueError);
                        throw new Error('Failed to queue renewal.');
                    }

                    await supabase.from("orders").update({ status: 'queued_for_renewal', final_username: order.username }).eq("id", orderId);
                    return { success: true, message: `Plan is still active. Renewal for ${order.username} has been queued successfully.` };

                } else {
                    // --- CONDITION B: PLAN HAS EXPIRED (Renew Immediately) ---
                    console.log(`[Immediate Renewal] Plan for ${order.username} (Order: ${orderId}) has expired. Renewing immediately.`);

                    const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;

                    const updatedClientSettings = {
                        id: clientInPanel.client.id,
                        email: clientInPanel.client.email,
                        total: totalGBValue,
                        expiryTime: expiryTime,
                        enable: true,
                        limitIp: clientInPanel.client.limitIp || 0,
                        flow: clientInPanel.client.flow || "",
                        tgId: clientInPanel.client.tgId || "",
                        subId: clientInPanel.client.subId || ""
                    };

                    const actualInboundId = clientInPanel.inboundId;
                    await v2rayService.updateClient(actualInboundId, clientInPanel.client.id, updatedClientSettings);
                    await v2rayService.resetClientTraffic(actualInboundId, clientInPanel.client.email);

                    console.log(`[Renewal Success] User ${order.username} updated on Inbound ${actualInboundId}`);

                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                    finalUsername = clientInPanel.client.email;
                }
            } else {
                // --- New User Logic OR Plan Change Logic ---
                finalUsername = order.username;

                // ================================================================
                // [NEW LOGIC START] PLAN CHANGE HANDLER
                // ================================================================
                // If this is a Plan Change (indicated by old_v2ray_username) AND the user wants 
                // to keep the SAME username, we MUST delete the old user first to avoid conflicts.
                if (order.old_v2ray_username && 
                    order.old_v2ray_username.toLowerCase() === finalUsername.toLowerCase()) {
                    
                    console.log(`[Plan Change] User matches old username (${finalUsername}). Attempting to remove old client first.`);
                    
                    try {
                        const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
                        if (oldClientData) {
                            await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                            console.log(`[Plan Change] Successfully deleted old user '${order.old_v2ray_username}' to free up username.`);
                        }
                    } catch (cleanupError) {
                        console.error(`[Plan Change Warning] Failed to delete old user '${order.old_v2ray_username}':`, cleanupError.message);
                        // We proceed anyway; if deletion failed, the conflict check below might rename the user.
                    }
                }
                // ================================================================
                // [NEW LOGIC END]
                // ================================================================

                const allPanelClients = await v2rayService.getAllClients();

                // Handle potential username conflicts
                // (This will now only trigger if the deletion above failed, or if it's a totally new user with a taken name)
                if (allPanelClients.has(finalUsername.toLowerCase())) {
                    let counter = 1;
                    let newUsername;
                    do {
                        newUsername = `${order.username}-${counter++}`;
                    } while (allPanelClients.has(newUsername.toLowerCase()));
                    finalUsername = newUsername;
                    console.log(`[Username Conflict] Generated new unique username for order ${orderId}: ${finalUsername}`);
                }

                const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
                const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;

                const clientSettings = { id: uuidv4(), email: finalUsername, totalGB: totalGBValue, expiryTime, enable: true, limitIp: 1 };

                const addClientResult = await v2rayService.addClient(inboundId, clientSettings);
                if (!addClientResult || !addClientResult.success) {
                    throw new Error(`Failed to create V2Ray user in panel for order ${orderId}: ${addClientResult.msg || 'Unknown panel error.'}`);
                }

                createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
            }

        } else if (order.status === 'unconfirmed') {
             // ... (Logic for unconfirmed orders remains same) ...
            finalUsername = order.final_username;
            if (!finalUsername) throw new Error(`Critical: final_username is missing for unconfirmed order ${orderId}.`);

             const clientInPanel = await v2rayService.findV2rayClient(finalUsername);
             if (!clientInPanel) throw new Error(`Critical: V2Ray client ${finalUsername} not found in panel.`);
             
             clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
             if (!clientLink) throw new Error(`Could not regenerate client link for ${finalUsername} (Order: ${orderId}).`);

        } else {
             return { success: false, message: `Order has an unexpected status: ${order.status}` };
        }

        // --- Common Logic for Finalizing (Database Updates) ---

        if (finalUsername && clientLink) {
            let updatedActivePlans = websiteUser.active_plans || [];
            let planIndex = -1;

            if (order.is_renewal) {
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === finalUsername.toLowerCase());
            } else if (order.old_v2ray_username) {
                // If it was a plan change, look for the old username in the array to replace it
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.old_v2ray_username.toLowerCase());
            }

            const newPlanDetails = {
                v2rayUsername: finalUsername,
                v2rayLink: clientLink,
                planId: order.plan_id,
                connId: order.conn_id,
                pkg: order.pkg || null, 
                activatedAt: new Date().toISOString(),
                orderId: order.id,
            };

            if (planIndex !== -1) {
                updatedActivePlans[planIndex] = newPlanDetails;
            } else {
                 if (!updatedActivePlans.some(p => p.orderId === order.id)) {
                      updatedActivePlans.push(newPlanDetails);
                 }
            }

            const { error: userUpdateError } = await supabase
                .from("users")
                .update({ active_plans: updatedActivePlans })
                .eq("id", websiteUser.id);

            if (userUpdateError) {
                 console.error(`Failed to update active_plans for user ${websiteUser.username}:`, userUpdateError);
            }
        }

        const finalStatus = isAutoConfirm ? 'unconfirmed' : 'approved';

        const { error: orderUpdateError } = await supabase.from("orders").update({
            status: finalStatus,
            final_username: finalUsername,
            approved_at: new Date().toISOString(),
            auto_approved: order.auto_approved || isAutoConfirm
        }).eq("id", orderId);

        if (orderUpdateError) {
             throw new Error(`Failed to update order status for ${orderId}: ${orderUpdateError.message}`);
        }

        // Send Email
        if (finalStatus === 'approved' && websiteUser.email) {
            const emailSubject = `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`;
            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: emailSubject,
                html: generateEmailTemplate(
                    `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`,
                    `Your ${order.plan_id} plan is ready.`,
                    generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername)
                )
            };

            try {
                await transporter.sendMail(mailOptions);
            } catch (emailError) {
                console.error(`[Email Error] FAILED to send approval email:`, emailError);
            }
        }

        // --- OLD CLEANUP LOGIC ---
        // Keeps old cleanup logic for cases where usernames were different (e.g., Change Plan from 'user1' to 'user2')
        // But skips if we already deleted it above.
        if (order.old_v2ray_username && finalStatus === 'approved' && !order.is_renewal) { 
             // Only attempt delete if the usernames were DIFFERENT. 
             // If they were same, we already deleted it at the top.
             if (order.old_v2ray_username.toLowerCase() !== finalUsername.toLowerCase()) {
                try {
                    const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
                    if (oldClientData) {
                        await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                        console.log(`[Plan Change Cleanup] Successfully deleted old user: ${order.old_v2ray_username}`);
                    }
                } catch (cleanupError) {
                    console.error(`[Cleanup Warning] Failed to delete old user: ${cleanupError.message}`);
                }
             }
        }

        return { success: true, message: `Order for ${finalUsername || order.username} successfully set to ${finalStatus}.`, finalUsername };

    } catch (error) {
        console.error(`[CRITICAL ERROR] Error processing order ${orderId}:`, error.message);

        if (createdV2rayClient) {
            try {
                await v2rayService.deleteClient(createdV2rayClient.inboundId, createdV2rayClient.settings.id);
            } catch (rollbackError) {
                console.error(`[ROLLBACK FAILED] Error: ${rollbackError.message}`);
            }
        }

        return { success: false, message: error.message || "An unexpected error occurred during order approval." };
    }
};

exports.processAutoConfirmableOrders = async () => {
    // ... (Existing implementation for auto confirm remains same) ...
    // Since you only asked for the approveOrder logic change, I am focusing on that.
    // The previous implementation of this function is preserved implicitly.
    try {
        const { data: settings, error: settingsError } = await supabase.from('settings').select('*');
        if (settingsError) throw settingsError;

        const enabledSettings = settings
            .filter(s => s.key.startsWith('auto_approve_') && (s.value === true || s.value === 'true'))
            .map(s => s.key.replace('auto_approve_', ''));

        if (enabledSettings.length === 0) return;

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
                const approvalResult = await exports.approveOrder(order.id, true);
                if (approvalResult.success) {
                    console.log(`[Auto-Confirm] Order ${order.id} processed successfully.`);
                } else {
                    console.error(`[Auto-Confirm] FAILED to process order ${order.id}. Reason: ${approvalResult.message}`);
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-approval cron job:', error.message);
    }
};