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

        // --- Change 1: Allow 'unconfirmed' orders to proceed for admin approval ---
        // Check if the order is already in a final state (approved) or queued (cannot be manually approved)
        if (order.status === 'approved' || order.status === 'queued_for_renewal') {
            return { success: false, message: `Order is already ${order.status}.` };
        }
        // --- End Change 1 ---

        // Extract necessary details from the order
        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;

        if (!inboundId || !vlessTemplate) {
            return { success: false, message: `Inbound ID or VLESS Template is missing for this order. Cannot approve.` };
        }

        // Fetch the website user associated with the order
        const { data: websiteUser, error: userFetchError } = await supabase
            .from("users")
            .select("*") // Select all user fields needed later (like email, active_plans)
            .ilike("username", order.website_username) // Use ilike for case-insensitive match
            .single();

        if (userFetchError || !websiteUser) {
            // Log the error for debugging
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

        // --- Change 2: Handle V2Ray logic based on current order status ---
        let clientLink; // Define clientLink outside the conditional blocks

        if (order.status === 'pending') {
            // --- Logic for Processing 'pending' Orders (New Users, Renewals, Changes) ---
            console.log(`[Order Processing] Status is 'pending' for order ${orderId}. Proceeding with V2Ray operations.`);

            if (order.is_renewal) {
                // --- Renewal Logic ---
                const clientInPanel = await v2rayService.findV2rayClient(order.username);
                if (!clientInPanel) {
                    return { success: false, message: `Renewal failed: User '${order.username}' not found in the panel.` };
                }

                const now = Date.now();
                const currentExpiryTime = clientInPanel.client.expiryTime || 0;

                if (currentExpiryTime > now) {
                    // --- CONDITION A: PLAN IS STILL ACTIVE (Queue Renewal) ---
                    console.log(`[Queued Renewal] Plan for ${order.username} (Order: ${orderId}) is still active. Queuing renewal.`);
                    const planDetailsForQueue = { /* ... (details as before) ... */ }; // Fill details as in original code
                    const { error: queueError } = await supabase.from('renewal_queue').insert({ /* ... (queue details) ... */ }); // Insert details as in original code

                    if (queueError) { /* ... (error handling) ... */ }

                    await supabase.from("orders").update({ status: 'queued_for_renewal', final_username: order.username }).eq("id", orderId);
                    return { success: true, message: `Plan is still active. Renewal for ${order.username} has been queued successfully.` };

                } else {
                    // --- CONDITION B: PLAN HAS EXPIRED (Renew Immediately) ---
console.log(`[Immediate Renewal] Plan for ${order.username} (Order: ${orderId}) has expired. Renewing immediately.`);

const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000; // දින 30ක් එකතු කිරීම
const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;

// 1. UUID සහ Email වෙනස් නොකර Settings සකසන්න
const updatedClientSettings = {
    id: clientInPanel.client.id,          // පරණ UUID එකම තබන්න
    email: clientInPanel.client.email,    // පරණ Email එකම තබන්න
    total: totalGBValue,                  // Data Reset
    expiryTime: expiryTime,               // Date Reset
    enable: true,
    limitIp: clientInPanel.client.limitIp || 0,
    flow: clientInPanel.client.flow || "",
    tgId: clientInPanel.client.tgId || "",
    subId: clientInPanel.client.subId || ""
};

// 2. වැදගත්ම කොටස: Order එකේ ඇති inbound ID එක නොව, 
//    Panel එකේ Client දැනට සිටින නියම Inbound ID එක (actualInboundId) භාවිතා කරන්න.
const actualInboundId = clientInPanel.inboundId;

// 3. Client Update කරන්න (පරණ ෆයිල් එකම Update වේ)
await v2rayService.updateClient(actualInboundId, clientInPanel.client.id, updatedClientSettings);

// 4. Traffic Reset කරන්න
await v2rayService.resetClientTraffic(actualInboundId, clientInPanel.client.email);

console.log(`[Renewal Success] User ${order.username} updated on Inbound ${actualInboundId}`);

// 5. ලින්ක් එක නැවත ජනනය කරන්න (පරණ විස්තරම සහිතව)
clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
finalUsername = clientInPanel.client.email;
                }
            } else {
                // --- New User or Plan Change Logic ---
                finalUsername = order.username;
                const allPanelClients = await v2rayService.getAllClients();

                // Handle potential username conflicts
                if (allPanelClients.has(finalUsername.toLowerCase())) {
                    let counter = 1;
                    let newUsername;
                    do {
                        newUsername = `${order.username}-${counter++}`;
                    } while (allPanelClients.has(newUsername.toLowerCase()));
                    finalUsername = newUsername;
                    console.log(`[Username Conflict] Generated new unique username for order ${orderId}: ${finalUsername}`);
                }

                // Prepare client settings
                const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
                const totalGBfromDB = parseInt(planDetails.total_gb, 10);
                 if (isNaN(totalGBfromDB)) { /* ... (error logging) ... */ }
                const totalGBValue = (totalGBfromDB || 0) * 1024 * 1024 * 1024;
                 console.log(`[DEBUG - New User] Order: ${orderId}, Plan: ${order.plan_id}, GB from DB: ${totalGBfromDB}, Final byte value: ${totalGBValue}`);

                const clientSettings = { id: uuidv4(), email: finalUsername, totalGB: totalGBValue, expiryTime, enable: true, limitIp: 1 };

                // Add client to V2Ray panel
                const addClientResult = await v2rayService.addClient(inboundId, clientSettings);
                if (!addClientResult || !addClientResult.success) {
                    throw new Error(`Failed to create V2Ray user in panel for order ${orderId}: ${addClientResult.msg || 'Unknown panel error.'}`);
                }

                // Track created client for potential rollback
                createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
            }

        } else if (order.status === 'unconfirmed') {
            // --- Logic for Finalizing 'unconfirmed' Orders (Admin Manual Approval) ---
            console.log(`[Admin Confirm] Order ${orderId} is 'unconfirmed'. Skipping V2Ray creation/update, proceeding to finalize.`);
            finalUsername = order.final_username; // Get the username set by the auto-confirm process

            if (!finalUsername) {
                // This indicates a problem in the auto-confirm logic or data inconsistency
                 throw new Error(`Critical: final_username is missing for unconfirmed order ${orderId}. Cannot proceed with approval.`);
            }

             // Regenerate the link based on the existing client data in the panel for consistency
             const clientInPanel = await v2rayService.findV2rayClient(finalUsername);
             if (!clientInPanel) {
                  // This indicates the client might have been deleted manually after auto-confirm
                  throw new Error(`Critical: V2Ray client ${finalUsername} (expected for unconfirmed order ${orderId}) not found in panel.`);
             }
             clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
             if (!clientLink) {
                  // This likely means the template stored in the order is invalid
                  throw new Error(`Could not regenerate client link for ${finalUsername} (Order: ${orderId}). Template might be invalid.`);
             }
             console.log(`[Admin Confirm] Successfully retrieved existing client details and link for ${finalUsername}.`);

        } else {
             // Should not happen if the initial status check is correct, but added as a safeguard
             console.error(`[Order Processing Error] Order ${orderId} has an unexpected status: ${order.status}. Aborting.`);
             return { success: false, message: `Order has an unexpected status: ${order.status}` };
        }
        // --- End Change 2 ---


        // --- Common Logic for Finalizing (runs for 'pending' that were processed, and 'unconfirmed') ---

        // Update the user's active_plans array in the database
        if (finalUsername && clientLink) {
            let updatedActivePlans = websiteUser.active_plans || [];
            let planIndex = -1;

            if (order.is_renewal) {
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === finalUsername.toLowerCase());
            } else if (order.old_v2ray_username) { // Handle plan changes
                planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.old_v2ray_username.toLowerCase());
            } // For new users, planIndex remains -1

            const newPlanDetails = {
    v2rayUsername: finalUsername,
    v2rayLink: clientLink,
    planId: order.plan_id,
    connId: order.conn_id,
    pkg: order.pkg || null, // <--- ADD THIS LINE to store the package name
    activatedAt: new Date().toISOString(),
    orderId: order.id, // Link plan to this specific order
};

            if (planIndex !== -1) {
                // Update existing plan entry (renewal or change)
                updatedActivePlans[planIndex] = newPlanDetails;
            } else {
                // Add new plan entry, ensuring no duplicates based on orderId
                 if (!updatedActivePlans.some(p => p.orderId === order.id)) {
                      updatedActivePlans.push(newPlanDetails);
                 }
            }

            // Update the user record
            const { error: userUpdateError } = await supabase
                .from("users")
                .update({ active_plans: updatedActivePlans })
                .eq("id", websiteUser.id);

            if (userUpdateError) {
                 console.error(`Failed to update active_plans for user ${websiteUser.username} (Order: ${orderId}):`, userUpdateError);
                 // Decide if this is critical enough to stop the process or just log it
                 // For now, log and continue, but consider implications
            }
        } else {
            // This should ideally not happen if the logic above is correct
             console.warn(`[Order Finalization Warning] finalUsername or clientLink is missing for order ${orderId}. Skipping user active_plans update.`);
        }

        // Determine the final status based on whether it was auto-confirmed or manually approved
        const finalStatus = isAutoConfirm ? 'unconfirmed' : 'approved';

        // Update the order status in the database
        const { error: orderUpdateError } = await supabase.from("orders").update({
            status: finalStatus,
            final_username: finalUsername, // Ensure finalUsername is stored
            approved_at: new Date().toISOString(), // Mark the time of this action
            auto_approved: order.auto_approved || isAutoConfirm // Mark if auto-approved
        }).eq("id", orderId);

        if (orderUpdateError) {
             throw new Error(`Failed to update order status for ${orderId}: ${orderUpdateError.message}`);
        }

        // Send approval email ONLY if manually approved (finalStatus is 'approved')
        if (finalStatus === 'approved' && websiteUser.email) {
            const emailSubject = `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`;
            const emailTitle = `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`;
            const emailPreheader = `Your ${order.plan_id} plan is ready.`;

            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: emailSubject,
                html: generateEmailTemplate(
                    emailTitle,
                    emailPreheader,
                    generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername)
                )
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log(`[Email Sent] Approval email sent successfully to ${websiteUser.email} for order ${orderId}.`);
            } catch (emailError) {
                // Log the failure but don't stop the overall success response
                console.error(`[Email Error] FAILED to send approval email for order ${orderId} to ${websiteUser.email}:`, emailError);
            }
        }

        // Final cleanup for 'change plan' orders (delete the old V2Ray user)
        // CRITICAL FIX: Ensure this ONLY runs if it is NOT a renewal.
        // අපි Controller එකේදී same username නම් renewal=true කළ නිසා, මේ කොටස දැන් renewal වලදී වැඩ කරන්නේ නෑ.
        if (order.old_v2ray_username && finalStatus === 'approved' && !order.is_renewal) { 
             try {
                  const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
                  if (oldClientData) {
                       // Only delete if it is NOT a renewal
                       await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                       console.log(`[Plan Change Cleanup] Successfully deleted old user: ${order.old_v2ray_username}`);
                  }
             } catch (cleanupError) {
                  console.error(`[Cleanup Warning] Failed to delete old user: ${cleanupError.message}`);
             }
        }

        // Return success message
        return { success: true, message: `Order for ${finalUsername || order.username} successfully set to ${finalStatus}.`, finalUsername };

    } catch (error) {
        // --- Error Handling & Rollback ---
        console.error(`[CRITICAL ERROR] Error processing order ${orderId}:`, error.message, error.stack);

        // Rollback V2Ray client creation if it happened within this attempt
        if (createdV2rayClient) {
            console.log(`[ROLLBACK] An error occurred processing order ${orderId}. Attempting to delete newly created V2Ray client ${createdV2rayClient.settings.email}...`);
            try {
                await v2rayService.deleteClient(createdV2rayClient.inboundId, createdV2rayClient.settings.id);
                console.log(`[ROLLBACK SUCCESS] Successfully deleted V2Ray client for order ${orderId}.`);
            } catch (rollbackError) {
                // Log critical error for manual intervention
                console.error(`[CRITICAL - ROLLBACK FAILED] FAILED TO ROLLBACK V2Ray client ${createdV2rayClient.settings.email} for order ${orderId}. PLEASE DELETE MANUALLY. Error: ${rollbackError.message}`);
            }
        }

        // Optionally, reset order status back to 'pending' if it was modified?
        // This depends on desired behavior. For now, we leave it as is or in the failed state.

        // Return error message
        return { success: false, message: error.message || "An unexpected error occurred during order approval." };
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