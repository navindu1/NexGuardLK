// File Path: src/controllers/orderController.js
// --- COMPLETE FIXED CODE ---

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
        // --- FIX 1: Auto-Detect Renewal vs Change ---
        // පරිශීලකයා 'Change Plan' තෝරාගෙන තිබුණත්, ඔහු Username එක වෙනස් කර නැත්නම් (Nelumi -> Nelumi),
        // අපි එය Renewal එකක් ලෙස සලකමු. එවිට UUID වෙනස් නොවී Traffic/Date Reset පමණක් සිදු වේ.
        if (old_v2ray_username && username && old_v2ray_username.trim().toLowerCase() === username.trim().toLowerCase()) {
            console.log(`[Order Logic] Same username detected (${username}). Converting 'Change' to 'Renewal' mode.`);
            isRenewal = "true"; 
        }
        
        // Convert to boolean for internal use
        const isRenewalBool = (isRenewal === "true" || isRenewal === true);

        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected." });
        }

        let finalPkg = pkg;

        // ============================================================
        // 1. SMART PACKAGE & INBOUND DETECTION
        // ============================================================
        
        // Renewal එකක් නම් (හෝ අපි Renewal ලෙස හඳුනා ගත්තා නම්), User දැනට ඉන්න Inbound එක සොයාගන්න.
        if (isRenewalBool && username) {
             console.log(`[Order] Renewal detected for ${username}. Looking up existing inbound...`);
             try {
                 const clientInPanel = await v2rayService.findV2rayClient(username);
                 if (clientInPanel) {
                     inboundId = clientInPanel.inboundId;
                     
                     // Inbound එකට අදාළ Template එක ගන්න
                     const { data: pkgInfo } = await supabase
                        .from('packages')
                        .select('template, name')
                        .eq('inbound_id', inboundId)
                        .single();
                        
                     if (pkgInfo) {
                         vlessTemplate = pkgInfo.template;
                         finalPkg = pkgInfo.name;
                     } else {
                         vlessTemplate = connection.default_vless_template;
                     }
                     console.log(`[Order] Found existing user on Inbound ${inboundId}.`);
                 }
             } catch (err) {
                 console.error("[Order] Failed to lookup existing client for renewal:", err);
             }
        }

        // Inbound ID සොයාගත නොහැකි නම් සාමාන්‍ය ක්‍රමයට සොයන්න
        if (!inboundId) {
            if (connection.requires_package_choice) {
                if (!finalPkg) { 
                    return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
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

                inboundId = selectedPackage.inbound_id;
                vlessTemplate = selectedPackage.template;
            } else {
                inboundId = connection.default_inbound_id;
                vlessTemplate = connection.default_vless_template;
                finalPkg = connection.default_package || connection.name; 
            }
        }

        if (!inboundId || !vlessTemplate) {
            return res.status(500).json({ success: false, message: 'The selected connection is not configured correctly.' });
        }

        // ============================================================
        // 2. IMMEDIATE RENEWAL EXECUTION (AUTO-UPDATE)
        // ============================================================
        // Renewal එකක් නම් V2Ray Panel එක එසැනින් Update කරන්න. 
        // මෙය මගින් Nelumi-1 හැදීම වලකින අතර පරණ Nelumi ම Update වේ.
        
        let orderUUID = uuidv4(); 

        if (isRenewalBool) {
            try {
                const currentClient = await v2rayService.findV2rayClient(username); // Using 'username' because it matches old_v2ray_username
                
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

                    // Update ONLY (UUID වෙනස් නොකර Update කරන්න)
                    await v2rayService.updateClient(currentClient.inboundId, currentClient.client.id, {
                        id: currentClient.client.id,      // Keep existing UUID
                        email: currentClient.client.email, // Keep existing Email
                        expiryTime: newExpiryTime,
                        enable: true,
                        total: currentClient.client.total || 0,
                        limitIp: currentClient.client.limitIp || 0,
                        flow: currentClient.client.flow || ""
                    });

                    console.log(`[Order] Immediate Renewal Applied for ${currentClient.client.email}`);
                }
            } catch (err) {
                console.error("[Order] Auto-renewal failed during order creation:", err);
            }
        }

        // ============================================================
        // 3. SAVE ORDER TO DATABASE
        // ============================================================
        
        const { data: planData } = await supabase.from('plans').select('price').eq('plan_name', planId).single();
        const orderPrice = planData ? planData.price : 0;

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
            is_renewal: isRenewalBool, // IMPORTANT: Save as true so Admin sees "Renew"
            old_v2ray_username: old_v2ray_username || null,
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate,
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