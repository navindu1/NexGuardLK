// File Path: src/controllers/orderController.js

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const v2rayService = require('../services/v2rayService');

exports.createOrder = async (req, res) => {
    let { planId, connId, pkg, whatsapp, username, isRenewal, old_v2ray_username, inboundId, vlessTemplate } = req.body;
    
    if (!planId || !connId || !whatsapp || !username || !req.file) {
        return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
        });
    }

    try {
        // --- 1. Fetch Plan Details FIRST (Need total_gb for limits) ---
        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('price, total_gb')
            .eq('plan_name', planId)
            .single();

        if (planError || !planData) throw new Error("Invalid plan selected.");
        
        const orderPrice = planData.price;
        const totalGBValue = (planData.total_gb || 0) * 1024 * 1024 * 1024; // Convert to Bytes

        // --- 2. Fetch Connection Details ---
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected." });
        }

        // --- 3. Determine TARGET Inbound & Template (New Configuration) ---
        let targetInboundId = inboundId;
        let targetVlessTemplate = vlessTemplate;
        let finalPkg = pkg;

        if (!targetInboundId) {
            if (connection.requires_package_choice) {
                if (!finalPkg) { 
                    return res.status(400).json({ success: false, message: 'A package selection is required.' });
                }
                
                const { data: selectedPackage, error: pkgError } = await supabase
                    .from('packages')
                    .select('inbound_id, template')
                    .eq('connection_id', connection.id)
                    .eq('name', finalPkg)
                    .single();

                if (pkgError || !selectedPackage) {
                    return res.status(400).json({ success: false, message: 'Invalid package selected.' });
                }

                targetInboundId = selectedPackage.inbound_id;
                targetVlessTemplate = selectedPackage.template;
            } else {
                targetInboundId = connection.default_inbound_id;
                targetVlessTemplate = connection.default_vless_template;
                finalPkg = connection.default_package || connection.name; 
            }
        }

        if (!targetInboundId || !targetVlessTemplate) {
            return res.status(500).json({ success: false, message: 'Connection configuration error.' });
        }

        // --- 4. SMART RENEWAL vs CHANGE DETECTION ---
        // Robust check for explicit "false" (Change Plan) vs "true" (Renew)
        // This handles strings "true"/"false", booleans, and undefined.
        const isExplicitChange = String(isRenewal).toLowerCase() === "false" || isRenewal === false;
        const isExplicitRenewal = String(isRenewal).toLowerCase() === "true" || isRenewal === true;

        let isRenewalBool = isExplicitRenewal; 

        if (old_v2ray_username) {
            try {
                const existingClient = await v2rayService.findV2rayClient(old_v2ray_username);
                
                if (existingClient) {
                    const currentInboundId = parseInt(existingClient.inboundId);
                    const newInboundId = parseInt(targetInboundId);

                    if (currentInboundId === newInboundId) {
                        // Same Inbound:
                        if (isExplicitChange) {
                            // User EXPLICITLY requested "Change Plan" (New Key), even on same inbound.
                            // We respect their wish.
                            isRenewalBool = false;
                            console.log(`[Order Logic] Same Inbound (${currentInboundId}). User explicitly requested CHANGE.`);
                        } else {
                            // User is on same inbound and did NOT explicitly say "Change".
                            // Assume "Renew" (or Upgrade/Downgrade keeping same key).
                            // This fixes the issue where "Renew" button might send undefined/missing flag.
                            isRenewalBool = true;
                            console.log(`[Order Logic] Same Inbound (${currentInboundId}). Auto-detecting as RENEWAL.`);
                        }
                    } else {
                        // Different Inbound: MUST be a Change/Migration (New User will be created)
                        console.log(`[Order Logic] Inbound Change (${currentInboundId} -> ${newInboundId}). Forcing CHANGE.`);
                        isRenewalBool = false; 
                    }
                } else {
                    // Client not found? Treat as new creation on new inbound
                    isRenewalBool = false;
                }
            } catch (err) {
                console.error("[Order Logic] Failed to lookup existing client:", err);
                // Fallback: If check fails, default to false (New/Change) to avoid overwriting wrong user
                isRenewalBool = false; 
            }
        }

        // ============================================================
        // 5. IMMEDIATE RENEWAL EXECUTION (AUTO-UPDATE)
        // ============================================================
        // Only run this if it is strictly a Renewal on the SAME inbound.
        
        let orderUUID = uuidv4(); 

        if (isRenewalBool) {
            try {
                // Use 'username' as it usually matches old_v2ray_username in renewals
                const currentClient = await v2rayService.findV2rayClient(username) || await v2rayService.findV2rayClient(old_v2ray_username);
                
                if (currentClient && currentClient.client) {
                    const now = Date.now();
                    let currentExpiry = Number(currentClient.client.expiryTime) || 0;
                    if (currentExpiry < 0) currentExpiry = 0;

                    let newExpiryTime;
                    if (currentExpiry > now) {
                        newExpiryTime = currentExpiry + (30 * 24 * 60 * 60 * 1000);
                    } else {
                        newExpiryTime = now + (30 * 24 * 60 * 60 * 1000);
                    }

                    // Update UUID, Email, AND Data Limit (Total GB)
                    await v2rayService.updateClient(currentClient.inboundId, currentClient.client.id, {
                        id: currentClient.client.id,      // Keep existing UUID
                        email: currentClient.client.email, // Keep existing Email
                        expiryTime: newExpiryTime,
                        total: totalGBValue,              // Apply NEW Data Limit from the Plan
                        enable: true,
                        limitIp: currentClient.client.limitIp || 0,
                        flow: currentClient.client.flow || ""
                    });

                    console.log(`[Order] Immediate Renewal Applied for ${currentClient.client.email} with ${planData.total_gb}GB limit.`);
                }
            } catch (err) {
                console.error("[Order] Auto-renewal failed during order creation:", err);
            }
        }

        // ============================================================
        // 6. SAVE ORDER TO DATABASE
        // ============================================================
        
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `receipt-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, file.buffer, { contentType: file.mimetype });

        if (uploadError) throw new Error("Failed to upload the receipt file.");

        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);

        const newOrder = {
            id: orderUUID,
            username: username,
            website_username: req.user.username,
            plan_id: planId,
            conn_id: connId,
            pkg: finalPkg || null,
            whatsapp,
            receipt_path: urlData.publicUrl,
            status: "pending",
            is_renewal: isRenewalBool, // This determines how Admin Panel sees it
            old_v2ray_username: old_v2ray_username || null,
            inbound_id: parseInt(targetInboundId, 10),
            vless_template: targetVlessTemplate,
            price: orderPrice
        };

        const { error: orderError } = await supabase.from("orders").insert([newOrder]);
        if (orderError) throw orderError;
        
        // Send Email
        const { data: websiteUser } = await supabase.from("users").select("email").eq("username", req.user.username).single();
        if (websiteUser?.email) {
            transporter.sendMail({
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: "Order Placed!",
                html: generateEmailTemplate("Order Received!", `Pending approval for ${planId}.`, generateOrderPlacedEmailContent(req.user.username, planId))
            }).catch(e => console.error("Email failed", e));
        }

        res.status(201).json({ success: true, message: "Order placed successfully!" });
        
    } catch (error) {
        console.error("Error creating order:", error.message);
        res.status(500).json({ success: false, message: error.message || "Failed to create order." });
    }
};