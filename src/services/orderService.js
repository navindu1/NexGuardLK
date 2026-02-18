// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

// --- Helper: Dynamic Prefix Matcher ---
// Database එකෙන් ලැබෙන Prefix Settings භාවිතා කර ගැලපෙන Prefix එක සොයයි.
function getPrefixFromSettings(connId, prefixSettings) {
    if (!connId || !prefixSettings) return "USR_"; // Default fallback
    
    const lowerConn = connId.toLowerCase();
    
    // prefixSettings යනු Admin Panel එකෙන් Save කළ JSON Object එකයි.
    // උදා: { "dialog": "DRC_", "airtel": "ARC_", "hutch": "HTC_" }
    
    // Object එකේ ඇති key (උදා: dialog) එක connection ID එකේ තිබේදැයි බලයි
    for (const [keyword, prefix] of Object.entries(prefixSettings)) {
        if (lowerConn.includes(keyword.toLowerCase())) {
            return prefix;
        }
    }
    
    return "USR_"; // ගැලපෙන එකක් නැත්නම්
}

/**
 * Approves an order. For renewals, it will queue the renewal if the current plan is still active.
 * Otherwise, it creates/updates the V2Ray user immediately.
 * Handles manual approval of 'unconfirmed' orders by skipping V2Ray creation and just finalizing.
 */
exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null; // To track if a client was newly created for potential rollback
    let order = null;

    try {
        // --- 1. Order Details ලබා ගැනීම ---
        const { data: orderData, error: orderError } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

        if (orderError || !orderData) {
            return { success: false, message: "Order not found." };
        }
        order = orderData;

        // Check if the order is already in a final state
        if (order.status === 'approved' || order.status === 'queued_for_renewal') {
            return { success: false, message: `Order is already ${order.status}.` };
        }

        // --- 2. Settings වලින් Prefix Map එක ලබා ගැනීම ---
        const { data: settingsData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'connection_prefixes')
            .single();

        let prefixMap = {
            "dialog": "DRC_",
            "airtel": "ARC_",
            "mobitel": "MRC_",
            "slt": "SLC_"
        }; // Default values

        if (settingsData && settingsData.value) {
            try {
                prefixMap = (typeof settingsData.value === 'string') 
                            ? JSON.parse(settingsData.value) 
                            : settingsData.value;
            } catch (e) {
                console.warn("Error parsing connection_prefixes setting, using defaults.");
            }
        }

        // --- Fetch User and Plan Details ---
        const { data: websiteUser, error: userFetchError } = await supabase
            .from("users")
            .select("*")
            .ilike("username", order.website_username)
            .single();

        if (userFetchError || !websiteUser) {
            return { success: false, message: `Website user "${order.website_username}" not found.` };
        }

        const { data: planDetails, error: planError } = await supabase
            .from("plans")
            .select("total_gb, plan_name")
            .eq("plan_name", order.plan_id)
            .single();

        if (planError || !planDetails) {
            return { success: false, message: `Plan details for "${order.plan_id}" not found.` };
        }

        const inboundId = order.inbound_id;
        const vlessTemplate = order.vless_template;

        if (!inboundId || !vlessTemplate) {
            return { success: false, message: `Inbound ID or VLESS Template is missing for this order.` };
        }

        let clientLink;

        // =========================================================
        // 3. USERNAME සැකසීම (DYNAMIC PREFIX SYSTEM)
        // =========================================================
        
        let baseUsername = order.username.trim();
        const prefix = getPrefixFromSettings(order.conn_id, prefixMap);
        let oldV2rayUsername = order.old_v2ray_username;

        // Final Username එක සැකසීම (Prefix + BaseName)
        if (baseUsername.toUpperCase().startsWith(prefix)) {
            finalUsername = baseUsername; 
        } else {
            finalUsername = `${prefix}${baseUsername}`;
        }

        console.log(`[Processing] Order: ${orderId} | Conn: ${order.conn_id} | Prefix: ${prefix} | User: ${finalUsername}`);

        if (order.status === 'pending') {
            // --- Logic for Processing 'pending' Orders ---

            // Panel එකේ දැනටමත් මේ නම (Prefix සහිත) තියෙනවද බලන්න
            const clientInPanel = await v2rayService.findV2rayClient(finalUsername);

            if (clientInPanel) {
                // ----------------------------------------------------
                // CASE A: User Panel එකේ ඉන්නවා (Renewal)
                // ----------------------------------------------------
                console.log(`[Renewal] User ${finalUsername} found in panel.`);

                // Inbound එක සමානද බලන්න
                if (parseInt(clientInPanel.inboundId) === parseInt(inboundId)) {
                    
                    const now = Date.now();
                    const currentExpiryTime = clientInPanel.client.expiryTime || 0;
                    
                    // --- QUEUED RENEWAL CHECK ---
                    if (order.is_renewal && currentExpiryTime > now) {
                        console.log(`[Queued Renewal] Plan for ${finalUsername} is still active. Queuing.`);
                        
                        const { error: queueError } = await supabase.from('renewal_queue').insert({
                            order_id: orderId,
                            v2ray_username: finalUsername,
                            activation_timestamp: new Date(currentExpiryTime).toISOString(),
                            new_plan_details: { ...order, final_username: finalUsername }
                        });

                        if (queueError) throw new Error('Failed to queue renewal.');

                        await supabase.from("orders").update({ status: 'queued_for_renewal', final_username: finalUsername }).eq("id", orderId);
                        return { success: true, message: `Plan is still active. Renewal for ${finalUsername} queued.` };
                    }

                    // --- IMMEDIATE RENEWAL ---
                    console.log(`[Immediate Renewal] Renewing ${finalUsername} immediately.`);
                    
                    const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
                    const totalGBValue = (planDetails.total_gb || 0) * 1024 * 1024 * 1024;

                    await v2rayService.updateClient(clientInPanel.inboundId, clientInPanel.client.id, {
                        expiryTime: expiryTime,
                        total: totalGBValue,
                        enable: true
                    });
                    await v2rayService.resetClientTraffic(clientInPanel.inboundId, finalUsername);

                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);

                } else {
                    // Inbound වෙනස් (ඉතා කලාතුරකින් විය හැක) -> Re-create
                    console.log(`[Migration] Inbound mismatch for ${finalUsername}. Re-creating...`);
                    await v2rayService.deleteClient(clientInPanel.inboundId, clientInPanel.client.id);
                    
                    const result = await createNewV2rayUser(inboundId, finalUsername, planDetails.total_gb, vlessTemplate);
                    createdV2rayClient = result.data;
                    clientLink = result.link;
                }

            } else {
                // ----------------------------------------------------
                // CASE B: User Panel එකේ නැහැ (New / Migration)
                // ----------------------------------------------------
                console.log(`[New/Migration] Creating ${finalUsername}...`);

                // 1. පරණ Account එක මකන්න (Prefix වෙනස් වී ඇත්නම් හෝ Old User වෙනස් නම්)
                if (oldV2rayUsername && oldV2rayUsername !== finalUsername) {
                    try {
                        const oldClient = await v2rayService.findV2rayClient(oldV2rayUsername);
                        if (oldClient) {
                            console.log(`[Cleanup] Deleting old user: ${oldV2rayUsername}`);
                            await v2rayService.deleteClient(oldClient.inboundId, oldClient.client.id);
                        }
                    } catch (e) {
                        console.warn(`[Cleanup Warning] Could not delete old user ${oldV2rayUsername}:`, e.message);
                    }
                }

                // 2. අලුත් User හදන්න (Duplicate Check සමග)
                const allClients = await v2rayService.getAllClients();
                if (allClients.has(finalUsername)) {
                     let counter = 1;
                     while (allClients.has(`${finalUsername}-${counter}`)) {
                         counter++;
                     }
                     finalUsername = `${finalUsername}-${counter}`;
                     console.log(`[Username Conflict] Generated unique username: ${finalUsername}`);
                }

                const result = await createNewV2rayUser(inboundId, finalUsername, planDetails.total_gb, vlessTemplate);
                createdV2rayClient = result.data;
                clientLink = result.link;
            }

        } else if (order.status === 'unconfirmed') {
            // --- Logic for Finalizing 'unconfirmed' Orders ---
            finalUsername = order.final_username;
            if (!finalUsername) throw new Error(`Critical: final_username is missing for unconfirmed order ${orderId}.`);

             const clientInPanel = await v2rayService.findV2rayClient(finalUsername);
             if (!clientInPanel) throw new Error(`Critical: V2Ray client ${finalUsername} not found in panel.`);
             
             clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
             if (!clientLink) throw new Error(`Could not regenerate client link for ${finalUsername}.`);

        } else {
             return { success: false, message: `Order has an unexpected status: ${order.status}` };
        }

        // --- 4. Database Updates (Active Plans) ---

        if (finalUsername && clientLink) {
            let updatedActivePlans = websiteUser.active_plans || [];
            
            // Remove old entries related to this username OR the old username
            updatedActivePlans = updatedActivePlans.filter(p => 
                p.v2rayUsername !== finalUsername && 
                p.v2rayUsername !== oldV2rayUsername
            );

            updatedActivePlans.push({
                v2rayUsername: finalUsername,
                v2rayLink: clientLink,
                planId: order.plan_id,
                connId: order.conn_id, // Connection ID එක Save කිරීම
                pkg: order.pkg || null, 
                activatedAt: new Date().toISOString(),
                orderId: order.id,
            });

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

        return { success: true, message: `Order for ${finalUsername} successfully set to ${finalStatus}.`, finalUsername };

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

// --- Helper: Create New User ---
async function createNewV2rayUser(inboundId, username, totalGb, vlessTemplate) {
    const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const totalGBValue = (totalGb || 0) * 1024 * 1024 * 1024;
    
    const clientSettings = { 
        id: uuidv4(), 
        email: username, 
        total: totalGBValue, 
        expiryTime, 
        enable: true, 
        limitIp: 1 
    };

    const addRes = await v2rayService.addClient(inboundId, clientSettings);
    if (!addRes.success) throw new Error("Failed to create user in panel.");

    const link = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
    return { data: { settings: clientSettings, inboundId }, link };
}

/**
 * AUTO CONFIRM LOGIC
 */
exports.processAutoConfirmableOrders = async () => {
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