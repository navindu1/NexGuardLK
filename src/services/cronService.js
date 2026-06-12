// File Path: src/services/cronService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateApprovalEmailContent } = require('./emailService');

exports.cleanupOldReceipts = async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    try {
        const { data: oldOrders, error } = await supabase
            .from("orders")
            .select("id, receipt_path")
            .eq("status", "approved")
            .not("receipt_path", "is", null)
            .neq("receipt_path", "created_by_reseller")
            .lte("created_at", fiveDaysAgo.toISOString());
        if (error) throw error;
        if (!oldOrders || oldOrders.length === 0) {
            console.log("Cron Job: No old receipts to delete.");
            return;
        }
        for (const order of oldOrders) {
            const urlParts = order.receipt_path.split('/');
            const fileName = urlParts[urlParts.length - 1];
            if (fileName) {
                const { error: deleteError } = await supabase.storage.from('receipts').remove([fileName]);
                if (deleteError) {
                    console.error(`Cron Job Error: Could not delete ${fileName}:`, deleteError.message);
                } else {
                    await supabase.from("orders").update({ receipt_path: null }).eq("id", order.id);
                }
            }
        }
    } catch (e) {
        console.error('Exception in cleanupOldReceipts cron job:', e.message);
    }
};

// --- START: NEW FUNCTION TO PROCESS THE RENEWAL QUEUE ---
exports.processRenewalQueue = async () => {
    console.log('[Cron Renewal] Running processRenewalQueue job...');
    try {
        const now = new Date();
        const { data: queuedItems, error: fetchError } = await supabase
            .from('renewal_queue')
            .select(`
                *,
                orders ( website_username )
            `)
            .eq('is_processed', false)
            .lte('activation_timestamp', now.toISOString());

        if (fetchError) throw fetchError;
        if (!queuedItems || queuedItems.length === 0) {
            console.log('[Cron Renewal] No renewals to process at this time.');
            return;
        }

        console.log(`[Cron Renewal] Found ${queuedItems.length} renewal(s) to process.`);

        for (const item of queuedItems) {
            try {
                const { v2ray_username, new_plan_details, order_id, orders: { website_username } } = item;
                const clientInPanel = await v2rayService.findV2rayClient(v2ray_username);
                if (!clientInPanel) {
                    throw new Error(`Client ${v2ray_username} not found in panel during queued activation.`);
                }

                const newExpiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
                const newTotalGB = (new_plan_details.total_gb || 0) * 1024 * 1024 * 1024;
                
                const updatedClientSettings = {
                    id: clientInPanel.client.id,
                    email: clientInPanel.client.email,
                    total: newTotalGB,
                    expiryTime: newExpiryTime,
                    enable: true,
                    tgId: clientInPanel.client.tgId || "",
                    subId: clientInPanel.client.subId || ""
                };

                await v2rayService.updateClient(new_plan_details.inbound_id, clientInPanel.client.id, updatedClientSettings);
                await v2rayService.resetClientTraffic(new_plan_details.inbound_id, clientInPanel.client.email);
                console.log(`[Cron Renewal] Successfully renewed V2Ray user: ${v2ray_username}`);

                await supabase
                    .from('orders')
                    .update({ status: 'approved', approved_at: new Date().toISOString() })
                    .eq('id', order_id);

                const { data: websiteUser } = await supabase.from("users").select("id, email, active_plans").eq("username", website_username).single();
                if (websiteUser) {
                    const clientLink = v2rayService.generateV2rayConfigLink(new_plan_details.vless_template, updatedClientSettings);
                    let updatedActivePlans = websiteUser.active_plans || [];
                    const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === v2ray_username.toLowerCase());

                    const renewedPlanDetails = {
                        v2rayUsername: v2ray_username,
                        v2rayLink: clientLink,
                        planId: new_plan_details.plan_id,
                        connId: new_plan_details.conn_id,
                        activatedAt: new Date().toISOString(),
                        orderId: order_id,
                    };
                    
                    if (planIndex !== -1) {
                        updatedActivePlans[planIndex] = renewedPlanDetails;
                    } else {
                        updatedActivePlans.push(renewedPlanDetails);
                    }
                    
                    await supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id);

                    if (websiteUser.email) {
                       const mailOptions = { from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`, to: websiteUser.email, subject: `Your NexGuard Plan has been Renewed!`, html: generateEmailTemplate( `Plan Renewed!`, `Your ${new_plan_details.plan_id} plan is now active.`, generateApprovalEmailContent(website_username, new_plan_details.plan_id, v2ray_username))};
                        await transporter.sendMail(mailOptions);
                        console.log(`[Cron Renewal] Renewal email sent to ${websiteUser.email}`);
                    }
                }
                
                await supabase.from('renewal_queue').update({ is_processed: true }).eq('id', item.id);

            } catch (processingError) {
                console.error(`[Cron Renewal] FAILED to process renewal for order ${item.order_id}:`, processingError.message);
                await supabase.from('renewal_queue').update({ is_processed: true, processing_error: processingError.message }).eq('id', item.id);
            }
        }

    } catch (error) {
        console.error('Error in processRenewalQueue cron job:', error.message);
    }
};
// --- END: NEW FUNCTION ---