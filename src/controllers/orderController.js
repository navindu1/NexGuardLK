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

        let parsedIsRenewal = isRenewal;
        
        if (typeof isRenewal === 'string' && isRenewal.includes(',')) {
            parsedIsRenewal = isRenewal.split(',')[0].trim(); // "true,true" ආවොත් "true" විතරක් ගන්නවා
        } else if (Array.isArray(isRenewal)) {
            parsedIsRenewal = isRenewal[0];
        }
        
        const isExplicitChange = String(parsedIsRenewal).toLowerCase() === "false" || parsedIsRenewal === false;
        const isExplicitRenewal = String(parsedIsRenewal).toLowerCase() === "true" || parsedIsRenewal === true;
        
        let isRenewalBool = isExplicitRenewal;

        // --- 1.5 Pending Order Check (Double Orders නැවැත්වීම) ---
        // කෙනෙකුට දැනටමත් Pending හෝ Unconfirmed Order එකක් තියෙනවා නම්, තව Order එකක් දාන්න දෙන්නේ නෑ
        const { data: existingPendingOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("website_username", req.user.username)
            .in("status", ["pending", "unconfirmed"])
            .maybeSingle();

        if (existingPendingOrder) {
            return res.status(400).json({ 
                success: false, 
                message: "You already have a pending or unconfirmed order. Please wait for it to be approved before placing a new one." 
            });
        }

        // --- 2. Backend Validation for Unique Username ---
        if (!isExplicitRenewal && username) {
            // පරණ නමත් prefix එක අයින් කරලා සංසන්දනය කරනවා (Frontend එකෙන් එන්නේ prefix නැති නම නිසා)
            const cleanOldUsername = old_v2ray_username ? old_v2ray_username.replace(/^[A-Za-z0-9]+_/, '') : '';

            if (!cleanOldUsername || username.toLowerCase() !== cleanOldUsername.toLowerCase()) {
                const existingClientCheck = await v2rayService.findV2rayClient(username);
                if (existingClientCheck) {
                    return res.status(400).json({ 
                        success: false, 
                        message: "This Username is already taken in the Panel. Please go back and generate a new one." 
                    });
                }
            }
        }

        // --- 3. Fetch Plan Details FIRST (Need total_gb for limits) ---
        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('price, total_gb')
            .eq('plan_name', planId)
            .single();

        if (planError || !planData) throw new Error("Invalid plan selected.");
        
        const orderPrice = planData.price;

        // --- 4. Fetch Connection Details ---
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected." });
        }

        // --- 5. Determine TARGET Inbound & Template (New Configuration) ---
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

        // --- 6. SMART RENEWAL vs CHANGE DETECTION ---
        if (old_v2ray_username) {
            try {
                const existingClient = await v2rayService.findV2rayClient(old_v2ray_username);
                
                if (existingClient) {
                    const currentInboundId = parseInt(existingClient.inboundId);
                    const newInboundId = parseInt(targetInboundId);

                    if (currentInboundId === newInboundId) {
                        if (isExplicitChange) {
                            isRenewalBool = false;
                            console.log(`[Order Logic] Same Inbound (${currentInboundId}). User explicitly requested CHANGE.`);
                        } else {
                            isRenewalBool = true;
                            console.log(`[Order Logic] Same Inbound (${currentInboundId}). Auto-detecting as RENEWAL.`);
                        }
                    } else {
                        console.log(`[Order Logic] Inbound Change (${currentInboundId} -> ${newInboundId}). Forcing CHANGE.`);
                        isRenewalBool = false; 
                    }
                } else {
                    if (isExplicitRenewal) {
                        console.log(`[Order Logic] Client not found, but User requested RENEWAL. Keeping flag as TRUE.`);
                        isRenewalBool = true;
                    } else {
                        isRenewalBool = false;
                    }
                }
            } catch (err) {
                console.warn("[Order Logic] Failed to lookup existing client:", err);
                isRenewalBool = isExplicitRenewal; 
            }
        }

        // ============================================================
        // 7. SAVE ORDER TO DATABASE
        // ============================================================
        
        const orderUUID = uuidv4(); 
        
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
            is_renewal: isRenewalBool, 
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