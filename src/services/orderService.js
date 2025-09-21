// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

const planConfig = {
    "100GB": { totalGB: 100 },
    "200GB": { totalGB: 200 },
    "300GB": { totalGB: 300 },
    "Unlimited": { totalGB: 0 },
};

exports.approveOrder = async (orderId, isAutoApproved = false) => {
    let finalUsername = '';
    let createdV2rayClient = null;

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single(); //
        if (orderError || !order) return { success: false, message: "Order not found." };
        if (order.status === 'approved' || order.status === 'unconfirmed') return { success: false, message: "Order is already processed." };

        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;
        
        if (!inboundId || !vlessTemplate) {
             return { success: false, message: `Inbound ID or VLESS Template is missing for this order. Cannot approve.` };
        }

        finalUsername = order.username; 
        const { data: websiteUser } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (!websiteUser) return { success: false, message: `Website user "${order.website_username}" not found.` };

        const plan = planConfig[order.plan_id];
        
        if (!plan) {
            return { success: false, message: "Invalid plan configuration." };
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
                await v2rayService.updateClient(inboundId, clientInPanel.client.id, updatedClientSettings);
                await v2rayService.resetClientTraffic(inboundId, clientInPanel.client.email);
                createdV2rayClient = { ...clientInPanel, isRenewal: true };
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                finalUsername = clientInPanel.client.email;
            } else {
                const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
                await v2rayService.addClient(inboundId, clientSettings);
                createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
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
            createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
            clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
        }
        
        let updatedActivePlans = websiteUser.active_plans || [];
        const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.username.toLowerCase());
        
        const newPlanDetails = {
            v2rayUsername: finalUsername, v2rayLink: clientLink, planId: order.plan_id, connId: order.conn_id,
            activatedAt: new Date().toISOString(), orderId: order.id,
        };

        if (order.is_renewal && planIndex !== -1) {
            updatedActivePlans[planIndex] = { ...updatedActivePlans[planIndex], ...newPlanDetails };
        } else {
            updatedActivePlans.push(newPlanDetails);
        }
        
        await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);
        
        await supabase.from("orders").update({
            status: "approved", // Initially set to 'approved'
            final_username: finalUsername,
            approved_at: new Date().toISOString(),
            auto_approved: isAutoApproved
        }).eq("id", orderId);

        if (websiteUser.email) {
            const mailOptions = { from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`, to: websiteUser.email, subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`, html: generateEmailTemplate( `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`, `Your ${order.plan_id} plan is ready.`, generateApprovalEmailContent(websiteUser.username, order.plan_id, finalUsername))};
            transporter.sendMail(mailOptions).catch(error => console.error(`FAILED to send approval email:`, error));
        }
        
        return { success: true, message: `Order for ${finalUsername} processed successfully.`, finalUsername };

    } catch (error) {
        console.error(`Error processing order ${orderId} for user ${finalUsername}:`, error.message, error.stack);

        if (createdV2rayClient && !createdV2rayClient.isRenewal) {
            console.log(`[ROLLBACK] An error occurred after creating V2Ray client ${createdV2rayClient.settings.email}. Attempting to delete client...`);
            try {
                await v2rayService.deleteClient(createdV2rayClient.inboundId, createdV2rayClient.settings.id);
                console.log(`[ROLLBACK] Successfully deleted V2Ray client ${createdV2rayClient.settings.email}.`);
            } catch (rollbackError) {
                console.error(`[CRITICAL] FAILED TO ROLLBACK V2RAY CLIENT ${createdV2rayClient.settings.email}. PLEASE DELETE MANUALLY. Error: ${rollbackError.message}`);
            }
        }
        
        return { success: false, message: error.message || "An error occurred during order approval." };
    }
};

// --- START: MODIFIED AUTO-APPROVAL LOGIC ---
exports.processAutoConfirmableOrders = async () => {
    try {
        const { data: settings, error: settingsError } = await supabase.from('settings').select('*');
        if (settingsError) throw settingsError;

        const enabledSettings = settings
            .filter(s => s.key.startsWith('auto_approve_') && (s.value === true || s.value === 'true'))
            .map(s => s.key.replace('auto_approve_', ''));

        if (enabledSettings.length === 0) {
            return; // No connections are enabled for auto-approval, so exit.
        }

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
        // Find orders that are 'pending' and meet the criteria
        const { data: ordersToApprove, error: ordersError } = await supabase
            .from('orders')
            .select('id') // We only need the ID to process them
            .eq('status', 'pending')
            .in('conn_id', enabledSettings)
            .lte('created_at', tenMinutesAgo);

        if (ordersError) throw ordersError;

        if (ordersToApprove && ordersToApprove.length > 0) {
            console.log(`[Auto-Approve] Found ${ordersToApprove.length} order(s) to auto-approve and move to Unconfirmed.`);

            // Process each order one by one
            for (const order of ordersToApprove) {
                console.log(`[Auto-Approve] Processing order ID: ${order.id}`);
                
                // Step 1: Approve the order. This creates the V2Ray user and sets status to 'approved'.
                // We call the approveOrder function from this same file.
                const approvalResult = await exports.approveOrder(order.id, true);

                if (approvalResult.success) {
                    console.log(`[Auto-Approve] Successfully approved order ${order.id}. Final username: ${approvalResult.finalUsername}`);
                    
                    // Step 2: Now, change the status from 'approved' to 'unconfirmed' for admin review.
                    const { error: updateError } = await supabase
                        .from('orders')
                        .update({ status: 'unconfirmed' })
                        .eq('id', order.id);

                    if (updateError) {
                        console.error(`[Auto-Approve] CRITICAL: Failed to move approved order ${order.id} to unconfirmed status. Please check manually. Error: ${updateError.message}`);
                    } else {
                        console.log(`[Auto-Approve] Order ${order.id} moved to 'unconfirmed' for admin review.`);
                    }
                } else {
                    // If the approval process itself failed
                    console.error(`[Auto-Approve] FAILED to auto-approve order ${order.id}. Reason: ${approvalResult.message}`);
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-approval cron job:', error.message);
    }
};
// --- END: MODIFIED AUTO-APPROVAL LOGIC ---