// File Path: src/controllers/orderController.js
// --- START: COMPLETE FIXED CODE ---

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const v2rayService = require('../services/v2rayService'); // Make sure v2rayService is imported

exports.createOrder = async (req, res) => {
    const { planId, connId, pkg, whatsapp, username, isRenewal, old_v2ray_username } = req.body;
    
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

        let inboundId, vlessTemplate;
        let finalPkg = pkg; // Use this variable to store the package name

        // --- START: UPDATED LOGIC TO FIX "PACKAGE SELECTION REQUIRED" ERROR ---
        if (connection.requires_package_choice) {
            
            // Package එකක් තෝරා නොමැති නම් සහ මෙය Renewal එකක් නම් පමණක් මෙය ක්‍රියාත්මක වේ
            if (!finalPkg && isRenewal === "true") {
                console.log(`[Order] Package missing for renewal of ${username}. Attempting to auto-detect...`);
                
                // 1. Find the user in the V2Ray panel
                const clientInPanel = await v2rayService.findV2rayClient(username);
                if (!clientInPanel) {
                    return res.status(404).json({ success: false, message: `Renewal failed: User '${username}' not found in the server panel.` });
                }

                // 2. Fetch all packages for this connection
                const { data: packages, error: pkgError } = await supabase
                    .from('packages')
                    .select('*')
                    .eq('connection_id', connection.id);
                
                if (pkgError || !packages) {
                    return res.status(500).json({ success: false, message: 'System Error: Could not fetch packages to verify renewal.' });
                }

                // 3. Match Client's Inbound ID with our Packages
                const clientInboundId = clientInPanel.inboundId;
                
                // FIX: Use loose equality (==) instead of strict (===) to handle String vs Number mismatches
                const foundPackage = packages.find(p => p.inbound_id == clientInboundId);

                if (foundPackage) {
                    finalPkg = foundPackage.name; // Package එක සොයාගත්තා!
                    console.log(`[Order] Successfully deduced package: ${finalPkg} (Inbound: ${clientInboundId})`);
                    inboundId = foundPackage.inbound_id;
                    vlessTemplate = foundPackage.template;
                } else {
                    // Package එක සොයාගැනීමට නොහැකි විය
                    console.warn(`[Order] Failed to deduce package for ${username}. Client Inbound ID (${clientInboundId}) not found in DB packages.`);
                    return res.status(400).json({ success: false, message: 'Could not auto-detect your current package. Please use the "Change Plan" option to manually select your package.' });
                }
            }

            // තවමත් Package එක සොයාගැනීමට නොහැකි නම් Error එක පෙන්වන්න
            if (!inboundId) { 
                if (!finalPkg) { 
                    return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
                }
                
                // Package නම තිබේ නම්, එහි විස්තර DB එකෙන් ගන්න
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
            }
        } else {
            // Single Package Connection
            inboundId = connection.default_inbound_id;
            vlessTemplate = connection.default_vless_template;
        }
        // --- END: UPDATED LOGIC ---

        if (!inboundId || !vlessTemplate) {
            return res.status(500).json({ success: false, message: 'The selected connection is not configured correctly. Please contact support.' });
        }
        
        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('price')
            .eq('plan_name', planId)
            .single();

        if (planError || !planData) {
            console.error("Plan price fetch error:", planError);
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
            console.error("Supabase storage error:", uploadError);
            throw new Error("Failed to upload the receipt file.");
        }

        const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const newOrder = {
            id: uuidv4(),
            username: username,
            website_username: req.user.username,
            plan_id: planId,
            conn_id: connId,
            pkg: finalPkg || null, // <--- Use finalPkg here
            whatsapp,
            receipt_path: publicUrl,
            status: "pending",
            is_renewal: isRenewal === "true",
            old_v2ray_username: old_v2ray_username || null,
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate,
            price: orderPrice
        };

        const { error: orderError } = await supabase.from("orders").insert([newOrder]);
        if (orderError) throw orderError;
        
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
                console.log(`Order placed email sent successfully to ${websiteUser.email}`);
            } catch (err) {
                console.error(`FAILED to send order placed email:`, err);
            }
        }

        res.status(201).json({ success: true, message: "Order placed successfully! It is now pending approval." });
        
    } catch (error) {
        console.error("Error creating order:", error.message);
        if (req.file && error.message !== "Failed to upload the receipt file.") {
            // This rollback logic might be incomplete, but leaving as is from original
            const fileName = `receipt-${req.file.filename.split('-')[1]}`; 
            supabase.storage.from('receipts').remove([fileName]).catch(removeError => {
                console.error("Failed to rollback receipt upload:", removeError.message);
            });
        }
        res.status(500).json({ success: false, message: error.message || "Failed to create order." });
    }
};

// --- END: COMPLETE FIXED CODE ---