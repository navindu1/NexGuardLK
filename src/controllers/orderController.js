// File Path: src/controllers/orderController.js

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

exports.createOrder = async (req, res) => {
    const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
    
    if (!planId || !connId || !whatsapp || !username || !req.file) {
        return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
        });
    }

    try {
        // Step 1: Fetch the main connection details from the database
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected. It might be inactive." });
        }

        let inboundId, vlessTemplate;

        // Step 2: Determine which inbound_id and vless_template to use
        if (connection.requires_package_choice) {
            if (!pkg) {
                 return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
            }
            
            // --- START OF FIX ---
            // Query the 'packages' table directly to validate and get package details
            const { data: selectedPackage, error: pkgError } = await supabase
                .from('packages')
                .select('inbound_id, template')
                .eq('connection_id', connection.id)
                .eq('name', pkg)
                .single();

            // If the package is not found for the given connection, return an error
            if (pkgError || !selectedPackage) {
                return res.status(400).json({ success: false, message: 'Invalid package selected for this connection.' });
            }
            // --- END OF FIX ---

            inboundId = selectedPackage.inbound_id;
            vlessTemplate = selectedPackage.template;
        } else {
            // Use default values for single-package connections
            inboundId = connection.default_inbound_id;
            vlessTemplate = connection.default_vless_template;
        }

        // Final check to ensure we have the necessary details
        if (!inboundId || !vlessTemplate) {
            return res.status(500).json({ success: false, message: 'The selected connection is not configured correctly. Please contact support.' });
        }

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
            pkg: pkg || null,
            whatsapp,
            receipt_path: publicUrl,
            status: "pending",
            is_renewal: isRenewal === "true",
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate 
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
                subject: "Your NexGuard Order Has Been Received!",
                html: generateEmailTemplate(
                    "Order Received!",
                    `Your order for the ${planId} plan is pending approval.`,
                    generateOrderPlacedEmailContent(websiteUser.username, planId)
                ),
            };
            transporter.sendMail(mailOptions).catch(err => console.error(`FAILED to send order placed email:`, err));
        }
        res.status(201).json({ success: true, message: "Order submitted successfully!" });
    } catch (error) {
        console.error("Error creating order:", error.message);
        res.status(500).json({ success: false, message: error.message || "Failed to create order." });
    }
};