// File Path: src/controllers/orderController.js

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

exports.createOrder = async (req, res) => {
    // --- ADD 'inboundId' and 'vlessTemplate' HERE ---
    const { planId, connId, pkg, whatsapp, username, isRenewal, inboundId, vlessTemplate } = req.body;
    
    if (!planId || !connId || !whatsapp || !username || !req.file || !inboundId || !vlessTemplate)
        return res.status(400).json({
            success: false,
            message: "Missing required order information, receipt file, or connection details.",
        });

    try {
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
