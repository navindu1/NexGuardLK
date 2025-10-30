// File Path: src/controllers/orderController.js
// --- START: COMPLETE UPDATED CODE ---

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

        // --- START: MODIFIED LOGIC TO HANDLE MISSING PACKAGE ON RENEWAL ---
        if (connection.requires_package_choice) {
            
            // Check if package is missing BUT it's a renewal
            if (!finalPkg && isRenewal === "true") {
                console.log(`[Order] Package missing for renewal of ${username}. Deducing...`);
                
                // Find the user in the V2Ray panel
                const clientInPanel = await v2rayService.findV2rayClient(username);
                if (!clientInPanel) {
                    return res.status(404).json({ success: false, message: `Renewal failed: User '${username}' not found in panel.` });
                }

                // Fetch all packages for this connection
                const { data: packages, error: pkgError } = await supabase
                    .from('packages')
                    .select('*')
                    .eq('connection_id', connection.id);
                
                if (pkgError || !packages) {
                    return res.status(500).json({ success: false, message: 'Could not fetch packages to deduce renewal.' });
                }

                // Try to find a matching package based on username prefix (same logic as linkV2rayAccount)
                let foundPackage = null;
                const clientUsernameLower = clientInPanel.client.email.toLowerCase();
                
                for (const p of packages) {
                    if (p.template) {
                        const remark = p.template.split('#')[1];
                        if (remark) {
                            const prefix = remark.split('{remark}')[0];
                            if (prefix && clientUsernameLower.startsWith(prefix.toLowerCase())) {
                                foundPackage = p;
                                break;
                            }
                        }
                    }
                }

                if (foundPackage) {
                    finalPkg = foundPackage.name; // We found it!
                    console.log(`[Order] Deduced package: ${finalPkg}`);
                    inboundId = foundPackage.inbound_id;
                    vlessTemplate = foundPackage.template;
                } else {
                    // Could not deduce package, so we must fail
                    console.warn(`[Order] Could not deduce package for ${username}.`);
                    return res.status(400).json({ success: false, message: 'Could not determine your current package. Please use the "Change Plan" option instead of "Renew" to manually select a package.' });
                }
            }

            // This block now runs if:
            // 1. A package was provided (new user OR new renewal flow)
            // 2. The package was deduced (old renewal flow)
            // It will fail if it's a new user and no package was provided.
            if (!inboundId) { // If inboundId wasn't set by the deduction logic...
                if (!finalPkg) { // Check if package is still missing
                    return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
                }
                
                // Package was provided, so get its details
                const { data: selectedPackage, error: pkgError } = await supabase
                    .from('packages')
                    .select('inbound_id, template')
                    .eq('connection_id', connection.id)
                    .eq('name', finalPkg)
                    .single();

                if (pkgError || !selectedPackage) {
                    return res.status(400).json({ success: false, message: 'Invalid package selected for this connection.' });
                }

                inboundId = selectedPackage.inbound_id;
                vlessTemplate = selectedPackage.template;
            }
        } else {
            // This is a single-package connection, logic is unchanged
            inboundId = connection.default_inbound_id;
            vlessTemplate = connection.default_vless_template;
        }
        // --- END: MODIFIED LOGIC ---


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

// --- END: COMPLETE UPDATED CODE ---