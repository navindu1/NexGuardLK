const nodemailer = require('nodemailer');
require('dotenv').config();

// --- ZOHO Transporter Logic ---
// This part configures HOW the email is sent, using your Zoho credentials
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true, // true for 465
    auth: {
        user: process.env.ZOHO_USER,
        pass: process.env.ZOHO_PASS,
    },
});

// --- ZOHO Send Email Function ---
// This function actually sends the email.
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"NexGuard LK" <${process.env.EMAIL_SENDER}>`,
            to,
            subject,
            html,
        });
        console.log('Email sent successfully using Zoho');
    } catch (error) {
        console.error('Error sending email via Zoho:', error);
        throw new Error('Failed to send email.');
    }
};

// --- Export the sendEmail function so other files can use it ---
exports.sendEmail = sendEmail;


// --- HTML Template Generation Logic ---
// This part defines WHAT the email looks like.

const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.nexguardlk.store";
// IMPORTANT: Replace YOUR_SERVER_URL with your actual domain for the background image to work
const BACKGROUND_IMAGE_URL = process.env.BACKGROUND_IMAGE_URL || "https://app.nexguardlk.store/assets/image.jpg"; 
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;

exports.generateEmailTemplate = (title, preheader, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@900&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 100%; -webkit-font-smoothing: antialiased; }
        .main-table { background-image: url('${BACKGROUND_IMAGE_URL}'); background-size: cover; background-position: center; }
        .content-box { background-color: rgba(10, 8, 28, 0.75); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; }
        @media (max-width: 600px) { .sm-w-full { width: 100% !important; } .sm-p-24 { padding: 24px !important; } }
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #020010;">
    <div style="display: none;">${preheader}</div>
    <table width="100%" height="100%" cellpadding="0" cellspacing="0" role="presentation" class="main-table">
        <tr>
            <td align="center" style="padding: 24px;">
                <table class="sm-w-full" style="width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                           <img src="${LOGO_URL}" width="150" alt="NexGuard Logo">
                        </td>
                    </tr>
                    <tr>
                        <td class="sm-p-24 content-box" style="padding: 40px; text-align: left; color: #e0e0e0; font-family: 'Inter', sans-serif;">
                            <p style="font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900; line-height: 1.2; margin: 0 0 24px; color: #ffffff;">${title}</p>
                            ${content}
                             <p style="margin: 40px 0 0; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 14px; color: #9ca3af;">Thank you,<br>The NexGuard Team</p>
                        </td>
                    </tr>
                    <tr>
                         <td style="padding: 24px; text-align: center; font-size: 12px; color: #9ca3af; font-family: 'Inter', sans-serif;">
                            <p style="margin: 0;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

const buttonStyle = `background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;`;

exports.generateOtpEmailContent = (otp) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px; color: #c7d2fe;">Your One-Time Password (OTP) is below. Use this code to complete your verification.</p>
<div style="background-color: rgba(30, 27, 75, 0.5); border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
    <p style="font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 900; letter-spacing: 4px; margin: 0; color: #ffffff;">${otp}</p>
</div>
<p style="font-size: 14px; line-height: 1.5; margin: 0; color: #9ca3af;">This code is valid for 10 minutes.</p>`;

exports.generatePasswordResetEmailContent = (username, resetLink) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px; color: #c7d2fe;">Hello, <strong>${username}</strong>! We received a request to reset your password. Click the button below to continue.</p>
<div style="text-align: center; margin: 24px 0;">
    <a href="${resetLink}" target="_blank" style="${buttonStyle}">Reset Password</a>
</div>
<p style="font-size: 14px; line-height: 1.5; margin: 24px 0 0; color: #9ca3af;">This link is valid for 10 minutes. If you didn't request this, please ignore this email.</p>`;

exports.generateApprovalEmailContent = (username, planId, finalUsername) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px; color: #c7d2fe;">Congratulations, <strong>${username}</strong>! Your NexGuard plan has been approved.</p>
<div style="background-color: rgba(30, 27, 75, 0.5); border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #4ade80;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #9ca3af; letter-spacing: 1px;">PLAN: <strong>${planId}</strong></p>
    <p style="margin: 0; font-size: 14px; color: #9ca3af; letter-spacing: 1px;">V2RAY USERNAME: <strong>${finalUsername}</strong></p>
</div>
<p style="font-size: 16px; line-height: 1.5; margin: 24px 0 0; color: #c7d2fe;">Log in to your profile to get your connection link.</p>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile" target="_blank" style="${buttonStyle}">Go to My Profile</a>
</div>`;

exports.generateOrderPlacedEmailContent = (username, planId) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px; color: #c7d2fe;">Hello, <strong>${username}</strong>! We've received your order for the <strong>${planId}</strong> plan. It's now pending approval.</p>
<div style="background-color: rgba(30, 27, 75, 0.5); border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;">You'll get another email once your plan is active. You can check your order status on your profile.</p>
</div>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile?tab=orders" target="_blank" style="${buttonStyle}">Check Order Status</a>
</div>`;

exports.generateRejectionEmailContent = (username, planId, orderId) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px; color: #c7d2fe;">Hello, <strong>${username}</strong>. We regret to inform you that your order (ID: ${orderId}) for the <strong>${planId}</strong> plan has been rejected.</p>
<div style="background-color: rgba(30, 27, 75, 0.5); border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #ef4444;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;">This could be due to an issue with the payment receipt. Please contact our support team on WhatsApp for clarification.</p>
</div>`;

exports.generateExpiryReminderEmailContent = (username, v2rayUsername, expiryDate) => `
<p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px; color: #c7d2fe;">Hello, <strong>${username}</strong>. This is a reminder that your plan for user <strong>${v2rayUsername}</strong> will expire in less than 24 hours.</p>
<div style="background-color: rgba(30, 27, 75, 0.5); border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #f97316;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;"><strong>Expires on:</strong> ${expiryDate.toLocaleString('en-US', { dateStyle: 'full' })}</p>
</div>
<p style="font-size: 16px; line-height: 1.5; margin: 24px 0 0; color: #c7d2fe;">To avoid service interruption, please renew your plan from your profile.</p>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile" target="_blank" style="${buttonStyle}">Renew Your Plan</a>
</div>`;
