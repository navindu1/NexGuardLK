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
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', connId)
            .single();
    
        if (connError || !connection) {
            return res.status(404).json({ success: false, message: "Invalid connection type selected. It might be inactive." });
        }

        let inboundId, vlessTemplate;

        if (connection.requires_package_choice) {
            if (!pkg) {
                 return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
            }
            
            const { data: selectedPackage, error: pkgError } = await supabase
                .from('packages')
                .select('inbound_id, template')
                .eq('connection_id', connection.id)
                .eq('name', pkg)
                .single();

            if (pkgError || !selectedPackage) {
                return res.status(400).json({ success: false, message: 'Invalid package selected for this connection.' });
            }

            inboundId = selectedPackage.inbound_id;
            vlessTemplate = selectedPackage.template;
        } else {
            inboundId = connection.default_inbound_id;
            vlessTemplate = connection.default_vless_template;
        }

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
            pkg: pkg || null,
            whatsapp,
            receipt_path: publicUrl,
            status: "pending",
            is_renewal: isRenewal === "true",
            inbound_id: parseInt(inboundId, 10),
            vless_template: vlessTemplate,
            price: orderPrice
        };

        const { error: orderError } = await supabase.from("orders").insert([newOrder]);
        if (orderError) throw orderError;
        
        // --- START: ADDED CODE ---
        // Fetch user's email for notification
        const { data: websiteUser } = await supabase
            .from("users")
            .select("email, username")
            .eq("username", req.user.username)
            .single();
            
        // Send email if the user has one
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
            transporter.sendMail(mailOptions).catch(err => console.error(`FAILED to send order placed email:`, err));
        }

        // Send a success response back to the browser
        res.status(201).json({ success: true, message: "Order placed successfully! It is now pending approval." });
        // --- END: ADDED CODE ---
        
    } catch (error) {
        console.error("Error creating order:", error.message);
        // Delete the uploaded file if order creation fails after upload
        if (req.file && error.message !== "Failed to upload the receipt file.") {
            const fileName = `receipt-${req.file.filename.split('-')[1]}`; // Reconstruct filename if needed
            supabase.storage.from('receipts').remove([fileName]).catch(removeError => {
                console.error("Failed to rollback receipt upload:", removeError.message);
            });
        }
        res.status(500).json({ success: false, message: error.message || "Failed to create order." });
    }
};