// File Path: src/services/emailService.js

const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.nexguardlk.store";
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;

exports.generateEmailTemplate = (title, preheader, content) => `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@900&display=swap" rel="stylesheet">
    <style>
      .hover-underline:hover { text-decoration: underline !important; }
      @media (max-width: 600px) { .sm-w-full { width: 100% !important; } .sm-px-24 { padding-left: 24px !important; padding-right: 24px !important; } }
    </style>
</head>
<body style="margin: 0; width: 100%; padding: 0; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #020010;">
    <div style="display: none;">${preheader}</div>
    <div role="article" aria-roledescription="email" aria-label="${title}" lang="en">
        <table style="width: 100%; font-family: 'Inter', sans-serif;" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
                <td align="center" style="background-color: #020010; padding-top: 24px; padding-bottom: 24px;">
                    <table class="sm-w-full" style="width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                            <td align="center" class="sm-px-24" style="padding-bottom: 24px;">
                               <img src="${LOGO_URL}" width="180" alt="NexGuard Logo" style="max-width: 100%; vertical-align: middle; line-height: 1; border: 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-top: 24px; padding-bottom: 24px;">
                                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                                    <tr>
                                        <td class="sm-px-24" style="background-color: #0a081c; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 48px; text-align: left; font-size: 16px; line-height: 24px; color: #e0e0e0; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);">
                                            <p style="font-family: 'Orbitron', sans-serif; font-size: 24px; font-weight: 900; line-height: 1.2; margin: 0 0 24px; color: #ffffff;">${title}</p>
                                            ${content}
                                            <p style="margin: 48px 0 0; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 14px; color: #9ca3af;">Thank you,<br>The NexGuard Team</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-left: 24px; padding-right: 24px; text-align: center; font-size: 12px; color: #9ca3af;">
                                <p style="margin: 0 0 4px;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK. All rights reserved.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;

exports.generateOtpEmailContent = (otp) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Your One-Time Password (OTP) for your NexGuard account is ready. Use the code below to complete your verification:</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
    <p style="font-size: 14px; line-height: 20px; margin: 0; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
    <p style="font-family: 'Orbitron', sans-serif; font-size: 36px; font-weight: 900; letter-spacing: 4px; margin: 8px 0 0 0; color: #ffffff; line-height: 1.2;">${otp}</p>
</div>
<p style="font-size: 14px; line-height: 20px; margin: 0; color: #9ca3af;">This code is valid for 10 minutes. If you did not request this, you can safely ignore this email.</p>`;

exports.generateApprovalEmailContent = (username, planId, finalUsername) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Congratulations, <strong>${username}</strong>! Your NexGuard plan has been approved and is now active.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #4ade80;">
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Plan Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td style="padding: 8px 0; color: #c7d2fe; font-size: 16px;">Selected Plan:</td>
            <td style="padding: 8px 0; color: #ffffff; font-size: 16px; font-weight: bold; text-align: right;">${planId}</td>
        </tr>
        <tr>
            <td style="padding: 8px 0; color: #c7d2fe; font-size: 16px; border-top: 1px solid #374151;">Your V2Ray Username:</td>
            <td style="padding: 8px 0; color: #ffffff; font-size: 16px; font-weight: bold; text-align: right; border-top: 1px solid #374151;">${finalUsername}</td>
        </tr>
    </table>
</div>
<p style="font-size: 16px; line-height: 24px; margin: 24px 0 0; color: #c7d2fe;">You can now log in to your profile on our website to find your connection link and manage your account.</p>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Go to My Profile</a>
</div>`;

exports.generateOrderPlacedEmailContent = (username, planId) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>!</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">We have successfully received your order for the <strong>${planId}</strong> plan. It is now pending approval from our administrators.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;">You will receive another email once your plan is activated. You can check the status of your order at any time on your profile page.</p>
</div>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile?tab=orders" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Check Order Status</a>
</div>`;

exports.generatePasswordResetEmailContent = (username, resetLink) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>!</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">We received a request to reset your password. Click the button below to set a new one. If you did not make this request, please ignore this email.</p>
<div style="text-align: center; margin: 32px 0;">
    <a href="${resetLink}" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Reset Your Password</a>
</div>
<p style="font-size: 14px; line-height: 20px; margin: 24px 0 0; color: #9ca3af;">This password reset link is valid for 1 hour.</p>`;

exports.generateRejectionEmailContent = (username, planId, orderId) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>,</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">We regret to inform you that your order for the <strong>${planId}</strong> plan has been rejected.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #ef4444;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;">This could be due to an issue with the payment receipt or other order details. Please contact our support team via WhatsApp for further clarification.</p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #9ca3af;">Your Order ID: ${orderId}</p>
</div>
<p style="font-size: 16px; line-height: 24px; margin: 24px 0 0; color: #c7d2fe;">We apologize for any inconvenience this may cause.</p>
`;

// Add this to the end of: src/services/emailService.js

exports.generateExpiryReminderEmailContent = (username, v2rayUsername, expiryDate) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>,</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">This is a friendly reminder that your V2Ray plan for user <strong>${v2rayUsername}</strong> is scheduled to expire in less than 24 hours.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #f97316;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;"><strong>Expiry Date:</strong> ${expiryDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' })}</p>
</div>
<p style="font-size: 16px; line-height: 24px; margin: 24px 0 0; color: #c7d2fe;">To avoid service interruption, please renew your plan by visiting your profile on our website.</p>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Renew Your Plan</a>
</div>`;