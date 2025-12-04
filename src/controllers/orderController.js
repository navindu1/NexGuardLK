// File Path: src/controllers/orderController.js
// --- COMPLETE FIXED CODE (RENEWAL DATA LIMIT & TRAFFIC RESET) ---

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const v2rayService = require('../services/v2rayService');

exports.createOrder = async (req, res) => {
    let { planId, connId, pkg, whatsapp, username, isRenewal, old_v2ray_username, inboundId, vlessTemplate } = req.body;
    
    if (!planId || !connId || !whatsapp || !username || !req.file) {
        return res.status(400).json({ success: false, message: "Missing required order information or receipt file." });
    }

    try {
        // --- FIX 1: Auto-Detect Renewal vs Change ---
        if (old_v2ray_username && username && old_v2ray_username.trim().toLowerCase() === username.trim().toLowerCase()) {
            console.log(`[Order Logic] Same username detected (${username}). Converting 'Change' to 'Renewal' mode.`);
            isRenewal = "true"; 
        }
        
        const isRenewalBool = (isRenewal === "true" || isRenewal === true);

        const { data: connection, error: connError } = await supabase.from('connections').select('*').eq('name', connId).single();
        if (connError || !connection) return res.status(404).json({ success: false, message: "Invalid connection type selected." });

        // --- FIX 2: FETCH PLAN DATA EARLY (To get Data Limit) ---
        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('price, total_gb') // total_gb ලබා ගැනීම අනිවාර්යයි
            .eq('plan_name', planId)
            .single();

        if (planError || !planData) return res.status(404).json({ success: false, message: "The selected plan is invalid." });
        
        const orderPrice = planData.price;
        // Data Limit එක Bytes වලට හරවා ගැනීම (GB * 1024^3)
        const planTotalBytes = (parseInt(planData.total_gb, 10) || 0) * 1024 * 1024 * 1024;

        let finalPkg = pkg;

        // ============================================================
        // 1. SMART PACKAGE & INBOUND DETECTION
        // ============================================================
        if (isRenewalBool && username) {
             try {
                 const clientInPanel = await v2rayService.findV2rayClient(username);
                 if (clientInPanel) {
                     inboundId = clientInPanel.inboundId;
                     const { data: pkgInfo } = await supabase.from('packages').select('template, name').eq('inbound_id', inboundId).single();
                     if (pkgInfo) {
                         vlessTemplate = pkgInfo.template;
                         finalPkg = pkgInfo.name;
                     } else {
                         vlessTemplate = connection.default_vless_template;
                     }
                 }
             } catch (err) {
                 console.error("[Order] Failed to lookup client for renewal:", err);
             }
        }

        if (!inboundId) {
            if (connection.requires_package_choice) {
                if (!finalPkg) return res.status(400).json({ success: false, message: 'Package selection required.' });
                const { data: selectedPackage } = await supabase.from('packages').select('inbound_id, template').eq('connection_id', connection.id).eq('name', finalPkg).single();
                if (!selectedPackage) return res.status(400).json({ success: false, message: 'Invalid package selected.' });
                inboundId = selectedPackage.inbound_id;
                vlessTemplate = selectedPackage.template;
            } else {
                inboundId = connection.default_inbound_id;
                vlessTemplate = connection.default_vless_template;
                finalPkg = connection.default_package || connection.name; 
            }
        }

        if (!inboundId || !vlessTemplate) return res.status(500).json({ success: false, message: 'Connection configuration error.' });

        // ============================================================
        // 2. IMMEDIATE RENEWAL EXECUTION (AUTO-UPDATE)
        // ============================================================
        let orderUUID = uuidv4(); 

        if (isRenewalBool) {
            try {
                const currentClient = await v2rayService.findV2rayClient(username);
                
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

                    // --- FIX 3: UPDATE WITH NEW DATA LIMIT & RESET TRAFFIC ---
                    await v2rayService.updateClient(currentClient.inboundId, currentClient.client.id, {
                        id: currentClient.client.id,
                        email: currentClient.client.email,
                        expiryTime: newExpiryTime,
                        enable: true,
                        total: planTotalBytes, // අලුත් Plan එකේ Data Limit එක මෙතනට වැටේ
                        limitIp: currentClient.client.limitIp || 0,
                        flow: currentClient.client.flow || ""
                    });

                    // Traffic Reset කිරීම (පරණ Usage එක බිංදුව කිරීම)
                    await v2rayService.resetClientTraffic(currentClient.inboundId, currentClient.client.email);

                    console.log(`[Order] Renewed & Reset Traffic for ${currentClient.client.email}. New Limit: ${planData.total_gb}GB`);
                }
            } catch (err) {
                console.error("[Order] Auto-renewal failed:", err);
            }
        }

        // ============================================================
        // 3. FILE UPLOAD & SAVE
        // ============================================================
        const file = req.file;
        const fileName = `receipt-${Date.now()}.${file.originalname.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (uploadError) throw new Error("Failed to upload receipt.");
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
            is_renewal: isRenewalBool,
            old_v2ray_username: old_v2ray_username || null,
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate,
            price: orderPrice
        };

        const { error: orderError } = await supabase.from("orders").insert([newOrder]);
        if (orderError) throw orderError;
        
        const { data: websiteUser } = await supabase.from("users").select("email, username").eq("username", req.user.username).single();
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