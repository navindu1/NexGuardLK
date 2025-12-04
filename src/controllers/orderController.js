// File Path: src/controllers/orderController.js
// --- START: COMPLETE FIXED CODE ---

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const v2rayService = require('../services/v2rayService'); // Make sure v2rayService is imported

exports.createOrder = async (req, res) => {
    // Note: Using 'let' for variables we might need to auto-correct
    let { planId, connId, pkg, whatsapp, username, isRenewal, old_v2ray_username, inboundId, vlessTemplate } = req.body;
    
    if (!planId || !connId || !whatsapp || !username || !req.file) {
        return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
        });
    }

    try {
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected. It might be inactive." });
        }

        let finalPkg = pkg; // Use this variable to store the package name

       // ============================================================
        // 1. SMART PACKAGE DETECTION LOGIC (RENEWAL FIX)
        // ============================================================
        
        // Renewal එකක් නම්, අපි බලහත්කාරයෙන්ම User දැනට ඉන්න Inbound එක හොයාගන්න ඕනේ.
        // Frontend එකෙන් එවන Package එක සමහර විට වැරදි වෙන්න පුළුවන් (User වෙනත් එකක් select කරලා තිබුනොත්).
        if ((isRenewal === "true" || isRenewal === true) && username) {
             console.log(`[Order] Renewal detected for ${username}. Looking up existing inbound...`);
             try {
                 const clientInPanel = await v2rayService.findV2rayClient(username);
                 if (clientInPanel) {
                     // පැනල් එකේ යූසර් ඉන්නවා නම්, ඒ Inbound ID එකම පාවිච්චි කරන්න.
                     inboundId = clientInPanel.inboundId;
                     
                     // ඒ Inbound එකට අදාළ Template එක DB එකෙන් ගන්න (Packages Table හරහා)
                     const { data: pkgInfo } = await supabase
                        .from('packages')
                        .select('template, name')
                        .eq('inbound_id', inboundId)
                        .single();
                        
                     if (pkgInfo) {
                         vlessTemplate = pkgInfo.template;
                         finalPkg = pkgInfo.name; // Package නම යාවත්කාලීන කරන්න
                         console.log(`[Order] Found existing user on Inbound ${inboundId}. Using Package: ${finalPkg}`);
                     } else {
                         // Package එක DB එකේ නැත්නම් Connection Default එක ගන්න (Fallback)
                         vlessTemplate = connection.default_vless_template;
                     }
                 }
             } catch (err) {
                 console.error("[Order] Failed to lookup existing client for renewal:", err);
             }
        }

        // Renewal එකක් නොවෙයි නම් හෝ Inbound එක හොයාගන්න බැරි වුනා නම් සාමාන්‍ය විදිහට යන්න
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
        // 2. IMMEDIATE RENEWAL EXECUTION LOGIC
        // ============================================================
        // මෙය මගින් පරණ User ව එසැනින් Update කරයි.
        
        let orderUUID = uuidv4(); // Default new UUID for fresh orders

        if (isRenewal === "true" || isRenewal === true) {
            console.log(`[Order] Processing IMMEDIATE RENEWAL for: ${old_v2ray_username} on Inbound: ${inboundId}`);

            try {
                // 2.1 Fetch existing client from V2Ray Panel
                const currentClient = await v2rayService.getClient(inboundId, old_v2ray_username);
                
                if (currentClient) {
                    // 2.2 Calculate Expiry (Add 30 days to current expiry OR today)
                    const now = Date.now();
                    let currentExpiry = Number(currentClient.expiryTime) || 0;
                    if (currentExpiry < 0) currentExpiry = 0; // Safety check

                    let newExpiryTime;
                    if (currentExpiry > now) {
                        // තාම කල් තියෙනවා නම් -> ඉතිරි දින + දින 30
                        newExpiryTime = currentExpiry + (30 * 24 * 60 * 60 * 1000);
                    } else {
                        // කල් ඉකුත් වී ඇත්නම් -> අද සිට දින 30
                        newExpiryTime = now + (30 * 24 * 60 * 60 * 1000);
                    }

                    // 2.3 Update V2Ray Panel Immediately
                    // වැදගත්ම දේ: අපි id එක ලෙස currentClient.id යවන නිසා UUID වෙනස් වෙන්නේ නෑ.
                    await v2rayService.updateClient(inboundId, old_v2ray_username, {
                        id: currentClient.id,      // KEEP OLD UUID
                        email: old_v2ray_username, // KEEP EMAIL
                        expiryTime: newExpiryTime, // NEW EXPIRY
                        enable: true,              // Re-enable if disabled
                        flow: currentClient.flow || "",
                        limitIp: currentClient.limitIp || 0,
                        total: currentClient.total || 0
                    });

                    console.log(`[Order] Renewal Applied Successfully. New Expiry: ${new Date(newExpiryTime).toLocaleString()}`);
                    
                    // Note: We don't change orderUUID to currentClient.id here to avoid Primary Key collisions in the orders table.
                    // The renewal is already applied to the server!
                    
                } else {
                    console.warn(`[Order] Client ${old_v2ray_username} not found for renewal. Order will be placed but requires manual admin fix.`);
                }
            } catch (err) {
                console.error("[Order] Auto-renewal failed during order creation:", err);
                // We don't stop the order creation, but we log the error.
            }
        }

        // ============================================================
        // 3. FILE UPLOAD & ORDER CREATION
        // ============================================================
        
        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('price')
            .eq('plan_name', planId)
            .single();

        if (planError || !planData) {
            return res.status(404).json({ success: false, message: "The selected plan is invalid or does not have a price." });
        }
        const orderPrice = planData.price;

        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `receipt-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (uploadError) {
            throw new Error("Failed to upload the receipt file.");
        }

        const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const newOrder = {
            id: orderUUID, // Use the generated order ID
            username: username,
            website_username: req.user.username,
            plan_id: planId,
            conn_id: connId,
            pkg: finalPkg || null,
            whatsapp,
            receipt_path: publicUrl,
            status: "pending", // Order is pending, but for renewals, V2Ray is likely already updated above
            is_renewal: isRenewal === "true" || isRenewal === true,
            old_v2ray_username: old_v2ray_username || null,
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate,
            price: orderPrice
        };

        const { error: orderError } = await supabase.from("orders").insert([newOrder]);
        if (orderError) throw orderError;
        
        // --- Email Notification Logic ---
        const { data: websiteUser } = await supabase
            .from("users")
            .select("email, username")
            .eq("username", req.user.username)
            .single();
            
        if (websiteUser && websiteUser.email) {
            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: "Your NexGuard Order has been placed!",
                html: generateEmailTemplate(
                    "Order Received!",
                    `Your order for the ${planId} plan is now pending approval.`,
                    generateOrderPlacedEmailContent(websiteUser.username, planId)
                ),
            };
            try {
                await transporter.sendMail(mailOptions);
            } catch (err) {
                console.error(`FAILED to send order placed email:`, err);
            }
        }

        res.status(201).json({ success: true, message: "Order placed successfully! Subscription updated." });
        
    } catch (error) {
        console.error("Error creating order:", error.message);
        if (req.file && error.message !== "Failed to upload the receipt file.") {
            const fileName = `receipt-${req.file.filename.split('-')[1]}`; 
            supabase.storage.from('receipts').remove([fileName]).catch(() => {});
        }
        res.status(500).json({ success: false, message: error.message || "Failed to create order." });
    }
};
// --- END: COMPLETE FIXED CODE ---