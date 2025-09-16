// File Path: src/controllers/orderController.js

const supabase = require('../config/supabaseClient');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderPlacedEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

exports.createOrder = async (req, res) => {
    const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
    if (!planId || !connId || !whatsapp || !username || !req.file)
        return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
        });

    const newOrder = {
        id: uuidv4(),
        username: username,
        website_username: req.user.username,
        plan_id: planId,
        conn_id: connId,
        pkg: pkg || null,
        whatsapp,
        receipt_path: req.file.path.replace(/\\/g, "/"),
        status: "pending",
        is_renewal: isRenewal === "true",
    };

    try {
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
        console.error("Error creating order:", error);
        res.status(500).json({ success: false, message: "Failed to create order." });
    }
};