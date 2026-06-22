// File Path: src/services/orderService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const { v4: uuidv4 } = require('uuid');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent, generateInvoiceEmailContent } = require('./emailService');

// --- Helper: Auto Generate Prefix ---
function generatePrefixFromName(connName) {
    if (!connName) return "USR_"; 
    
    const words = connName.trim().split(/\s+/);
    let prefix = "";
    for (const word of words) {
        if (word.length > 0) {
            prefix += word[0].toUpperCase();
        }
    }
    return prefix + "_";
}

/**
 * Approves an order. For renewals, it will queue the renewal if the current plan is still active.
 * Otherwise, it creates/updates the V2Ray user immediately.
 * Handles manual approval of 'unconfirmed' orders by skipping V2Ray creation and just finalizing.
 */
exports.approveOrder = async (orderId, isAutoConfirm = false) => {
    let finalUsername = '';
    let createdV2rayClient = null; 
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

        if (order.status === 'approved' || order.status === 'queued_for_renewal') {
            return { success: false, message: `Order is already ${order.status}.` };
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
        // 2. USERNAME සැකසීම (AUTO PREFIX SYSTEM)
        // =========================================================

        let baseUsername = order.username.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        
        const prefix = generatePrefixFromName(order.conn_id); 
        let oldV2rayUsername = order.old_v2ray_username;

        if (baseUsername.toUpperCase().startsWith(prefix)) {
            finalUsername = baseUsername; 
        } else {
            finalUsername = `${prefix}${baseUsername}`;
        }

        console.log(`[Processing] Order: ${orderId} | Conn: ${order.conn_id} | Prefix: ${prefix} | User: ${finalUsername}`);

        // =========================================================
        // 3. GROUP NAME එක සොයාගැනීම (Database එකෙන් හෝ Default)
        // =========================================================
        let groupName = "";
        if (order.pkg) {
            const { data: pkgData } = await supabase.from('packages').select('group_name').eq('name', order.pkg).single();
            if (pkgData && pkgData.group_name) groupName = pkgData.group_name;
        }
        if (!groupName && order.conn_id) {
            const { data: connData } = await supabase.from('connections').select('group_name').eq('name', order.conn_id).single();
            if (connData && connData.group_name) groupName = connData.group_name;
        }
        if (!groupName) {
            groupName = `${order.conn_id} - ${order.pkg || order.plan_id}`;
        }

        if (order.status === 'pending') {
            // --- Logic for Processing 'pending' Orders ---
            const isRenewalRequest = (order.is_renewal === true || order.is_renewal === 'true');
            let clientInPanel = await v2rayService.findV2rayClient(finalUsername);

            let oldUUID = null;
            let oldSubId = null;

            // --- 1. HANDLE CHANGE ORDER CLEANUP ---
            if (!isRenewalRequest && order.old_v2ray_username) {
                try {
                    const oldClient = await v2rayService.findV2rayClient(order.old_v2ray_username);
                    if (oldClient) {
                        oldUUID = oldClient.client.id;
                        oldSubId = oldClient.client.subId || "";

                        console.log(`[Change Order] Deleting old user to preserve ID/SubID: ${order.old_v2ray_username}`);
                        // UUID වෙනුවට Email එක යවනවා
                        await v2rayService.deleteClient(oldClient.client.email);

                        console.log(`[Change Order] Waiting 1.5s for 3x-ui database to sync...`);
                        await new Promise(resolve => setTimeout(resolve, 1500));

                        if (clientInPanel && clientInPanel.client.email.toLowerCase() === order.old_v2ray_username.toLowerCase()) {
                            clientInPanel = null;
                        }
                    }
                } catch (e) {
                    console.warn(`[Cleanup Warning] Could not delete old user ${order.old_v2ray_username}:`, e.message);
                    console.log(`[Change Order] Falling back to new UUID/SubID because deletion failed.`);
                    oldUUID = null;
                    oldSubId = null; 
                }
            }

            if (clientInPanel && isRenewalRequest) {
                // ----------------------------------------------------
                // CASE A: User Panel Renewal
                // ----------------------------------------------------
                console.log(`[Renewal] User ${finalUsername} found in panel. Processing renewal...`);
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
                    
                    let parsedGb = parseFloat(planDetails.total_gb);
                    if (isNaN(parsedGb) || parsedGb <= 0) {
                        const match = order.plan_id.match(/(\d+)\s*GB/i);
                        if (match) parsedGb = parseFloat(match[1]);
                    }
                    const totalGBValue = isNaN(parsedGb) || parsedGb <= 0 ? 0 : Math.round(parsedGb * 1024 * 1024 * 1024);

                    const updatedClientConfig = {
                        id: clientInPanel.client.id,
                        email: clientInPanel.client.email,
                        enable: true,
                        expiryTime: expiryTime,
                        totalGB: totalGBValue,
                        limitIp: 2, // IP Limit එක 2
                        tgId: clientInPanel.client.tgId || 0,
                        subId: clientInPanel.client.subId || "",
                        flow: clientInPanel.client.flow || "",
                        group: groupName || clientInPanel.client.group || "",
                        comment: order.whatsapp || "" // Whatsapp අංකය Comment එකට යවනවා
                    };

                    await v2rayService.updateClient(clientInPanel.inboundId, clientInPanel.client.id, updatedClientConfig);
                    await v2rayService.resetClientTraffic(clientInPanel.inboundId, finalUsername);
                    clientLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientInPanel.client);
                    
                } else {
                    console.log(`[Migration] Inbound mismatch for ${finalUsername}. Re-creating...`);
                    
                    try {
                        // UUID වෙනුවට Email එක යවනවා
                        await v2rayService.deleteClient(clientInPanel.client.email);
                        
                        console.log(`[Migration] Waiting 1.5s for 3x-ui database to sync...`);
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        oldUUID = clientInPanel.client.id;
                        oldSubId = clientInPanel.client.subId;
                    } catch (e) {
                        console.warn(`[Migration Warning] Could not delete old user:`, e.message);
                        oldUUID = null;
                        oldSubId = null;
                    }

                    // මෙතන order.whatsapp පාස් කරනවා
                    const result = await createNewV2rayUser(inboundId, finalUsername, planDetails.total_gb, vlessTemplate, order.plan_id, groupName, oldUUID, oldSubId, order.whatsapp);
                    createdV2rayClient = result.data;
                    clientLink = result.link;
                }
            } else {
                console.log(`[New Connection] Processing ${finalUsername}...`);

                if (clientInPanel) {
                    throw new Error(`Username '${finalUsername}' already exists in the server!`);
                }

                // මෙතනත් order.whatsapp පාස් කරනවා
                const result = await createNewV2rayUser(inboundId, finalUsername, planDetails.total_gb, vlessTemplate, order.plan_id, groupName, oldUUID, oldSubId, order.whatsapp);
                createdV2rayClient = result.data;
                clientLink = result.link;
            }
        } else if (order.status === 'unconfirmed') {
            // --- Logic for Finalizing 'unconfirmed' Orders ---
            // මෙතනදී අලුතින් V2Ray එකක් හැදෙන්නේ නෑ. දැනට තියෙන එක හොයාගෙන Link එක ගන්නවා විතරයි
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
            
            updatedActivePlans = updatedActivePlans.filter(p => 
                p.v2rayUsername !== finalUsername && 
                p.v2rayUsername !== oldV2rayUsername
            );

            updatedActivePlans.push({
                v2rayUsername: finalUsername,
                v2rayLink: clientLink,
                planId: order.plan_id,
                connId: order.conn_id, 
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
            // 1. සාමාන්‍ය Approval Email එක
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

            // 2. අලුතින් හදපු Invoice Email එක
            const shortOrderId = orderId.substring(0, 8).toUpperCase(); // ID එක දිග වැඩි නිසා මුල් අකුරු ටික ගමු
            const invoiceSubject = `Payment Receipt - Order #${shortOrderId}`;
            const invoiceOptions = {
                from: `NexGuard Billing <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: invoiceSubject,
                html: generateInvoiceEmailContent(
                    websiteUser.username, 
                    shortOrderId, 
                    order.plan_id, 
                    order.conn_id || 'Standard Connection', 
                    order.price || '0.00', 
                    new Date().toLocaleDateString()
                )
            };

            try {
                // Emails දෙකම එකපාර යවනවා
                await transporter.sendMail(mailOptions);
                await transporter.sendMail(invoiceOptions);
                console.log(`[Email] Approval and Invoice emails sent to ${websiteUser.email}`);
            } catch (emailError) {
                console.error(`[Email Error] FAILED to send emails:`, emailError);
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
async function createNewV2rayUser(inboundId, username, totalGb, vlessTemplate, planName = "", groupName = "", existingId = null, existingSubId = null, whatsapp = "") {
    const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;

    let parsedGb = parseFloat(totalGb);
    if (isNaN(parsedGb) || parsedGb <= 0) {
        const match = planName.match(/(\d+)\s*GB/i);
        if (match) parsedGb = parseFloat(match[1]); 
    }
    const totalGBValue = isNaN(parsedGb) || parsedGb <= 0 ? 0 : Math.round(parsedGb * 1024 * 1024 * 1024);

    const finalGroupName = groupName || `General Users - ${planName || 'Unknown Plan'}`;

    const clientSettings = {
        id: existingId || uuidv4(), 
        email: username,
        totalGB: totalGBValue,
        expiryTime,
        enable: true,
        limitIp: 2, // IP Limit එක 2
        tgId: 0,
        subId: existingSubId || "", 
        group: finalGroupName,
        comment: whatsapp // Whatsapp අංකය ඇතුලත් කිරීම
    };

    const addRes = await v2rayService.addClient(inboundId, clientSettings);

    if (!addRes || !addRes.success) {
        const panelErrorMsg = addRes ? addRes.msg : "Unknown Panel Error";
        console.error(`[3x-ui Panel Error] Failed to create user. Reason: ${panelErrorMsg}`);
        throw new Error(`Panel Rejected: ${panelErrorMsg}`);
    }

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