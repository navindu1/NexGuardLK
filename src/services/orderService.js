// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

// File: src/services/orderService.js

exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null;

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) return { success: false, message: "Order not found." };
        
        if (order.status === 'approved') return { success: false, message: "Order is already approved." };

        // START: ADDED LOGIC FOR "CHANGE PLAN"
        if (order.old_v2ray_username && order.status === 'pending') {
            console.log(`[Change Plan] Deleting old V2Ray user: ${order.old_v2ray_username}`);
            try {
                const oldClientData = await v2rayService.findV2rayClient(order.old_v2ray_username);
                if (oldClientData) {
                    await v2rayService.deleteClient(oldClientData.inboundId, oldClientData.client.id);
                    console.log(`[Change Plan] Successfully deleted old user: ${order.old_v2ray_username}`);
                }
            } catch (deleteError) {
                console.error(`[Change Plan] Failed to delete old V2Ray user ${order.old_v2ray_username}. Continuing with new user creation. Error: ${deleteError.message}`);
            }
        }
        // END: ADDED LOGIC

        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;
        
        if (!inboundId || !vlessTemplate) {
             return { success: false, message: `Inbound ID or VLESS Template is missing for this order. Cannot approve.` };
        }

        finalUsername = order.username; 
        const { data: websiteUser } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (!websiteUser) return { success: false, message: `Website user "${order.website_username}" not found.` };

        // START: MODIFIED LOGIC - Fetch plan details from the database
        const { data: planDetails, error: planError } = await supabase
            .from("plans")
            .select("total_gb")
            .eq("plan_name", order.plan_id)
            .single();

        if (planError || !planDetails) {
            return { success: false, message: `Plan details for "${order.plan_id}" not found in the database.` };
        }
        // END: MODIFIED LOGIC

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        // Use 'total_gb' from the database to calculate the byte value
        const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;        
        let clientLink;
        
        if (order.status === 'pending') {
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
                // --- START: OPTIMIZED USERNAME UNIQUENESS CHECK ---
                // 1. V2Ray පැනලයේ ඇති සියලුම user නම් එකවර ලබාගැනීම.
                const allPanelClients = await v2rayService.getAllClients();

                // 2. ලබා දී ඇති username එක දැනටමත් පවතීදැයි පරීක්ෂා කිරීම.
                if (allPanelClients.has(finalUsername.toLowerCase())) {
                    let counter = 1;
                    let newUsername;
                    // 3. නව username එකක් local list එකෙන් පරීක්ෂා කරමින්, ගැටුමක් නොමැති නමක් සොයාගැනීම.
                    //    මෙම ක්‍රියාවලිය ඉතා වේගවත්ය, કારણ કે API calls සිදු නොවේ.
                    do {
                        newUsername = `${order.username}-${counter++}`;
                    } while (allPanelClients.has(newUsername.toLowerCase()));
                    finalUsername = newUsername;
                    console.log(`[Username Conflict] Original username was taken. Generated new unique username: ${finalUsername}`);
                }
                // --- END: OPTIMIZED USERNAME UNIQUENESS CHECK ---
                
                const clientSettings = { id: uuidv4(), email: finalUsername, total: totalGBValue, expiryTime, enable: true };
                await v2rayService.addClient(inboundId, clientSettings);
                createdV2rayClient = { settings: clientSettings, inboundId: inboundId };
                clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
            }
        
            // START: MODIFIED LOGIC FOR UPDATING USER'S ACTIVE PLANS
            let updatedActivePlans = websiteUser.active_plans || [];
            const planIndex = order.old_v2ray_username 
                ? updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.old_v2ray_username.toLowerCase())
                : updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === order.username.toLowerCase());

            const newPlanDetails = {
                v2rayUsername: finalUsername, v2rayLink: clientLink, planId: order.plan_id, connId: order.conn_id,
                activatedAt: new Date().toISOString(), orderId: order.id,
            };

            if (planIndex !== -1) {
                updatedActivePlans[planIndex] = newPlanDetails;
            } else {
                updatedActivePlans.push(newPlanDetails);
            }
            // END: MODIFIED LOGIC

            await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);
        } else {
            const existingPlan = websiteUser.active_plans.find(p => p.orderId === order.id);
            clientLink = existingPlan ? existingPlan.v2rayLink : '#';
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
        
        return { success: true, message: `Order for ${finalUsername} moved to ${finalStatus}.`, finalUsername };

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
                
                // --- CHANGED FUNCTION CALL ---
                // Call the modified approveOrder function with isAutoConfirm = true
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
