// File Path: src/controllers/orderController.js

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

// src/controllers/orderController.js

exports.createOrder = async (req, res) => {
    // REMOVED inboundId and vlessTemplate from here. They will be fetched from the DB.
    const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
    
    // Check for core information
    if (!planId || !connId || !whatsapp || !username || !req.file) {
        return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
        });
    }

    try {
        // Securely fetch connection details from the database using connId
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*') // Select all details
            .eq('name', connId) // Use the name as the identifier
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected. It might be inactive." });
        }

        // Determine which inbound_id and vless_template to use based on package choice
        let inboundId, vlessTemplate;

        if (connection.requires_package_choice) {
            if (!pkg) {
                 return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
            }
            // Safely parse package options from the database record
            const packageOptions = JSON.parse(connection.package_options || '[]');
            const selectedPackage = packageOptions.find(p => p.name === pkg);
            
            if (!selectedPackage) {
                return res.status(400).json({ success: false, message: 'Invalid package selected for this connection.' });
            }
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


        // --- The rest of the function remains mostly the same ---

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
            conn_id: connId, // Storing the name of the connection
            pkg: pkg || null,
            whatsapp,
            receipt_path: publicUrl,
            status: "pending",
            is_renewal: isRenewal === "true",
            // --- Use the SECURE, backend-fetched values ---
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