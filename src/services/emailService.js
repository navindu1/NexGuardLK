const transporter = require('../config/mailer');

/**
 * Zoho Mail හරහා email යැවීම සඳහා වන ප්‍රධාන function එක.
 */
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"NexGuard LK" <${process.env.EMAIL_SENDER}>`,
            to,
            subject,
            html,
        });
        // Log message එක Zoho ලෙස වෙනස් කළා
        console.log(`Email sent successfully to ${to} via Zoho.`);
    } catch (error) {
        // Error message එකත් Zoho ලෙස වෙනස් කළා
        console.error(`Error sending email via Zoho to ${to}:`, error);
        throw new Error('Failed to send email.');
    }
};

// --- Configuration Variables ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.nexguardlk.store";
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;
const HELP_CENTER_URL = process.env.HELP_CENTER_URL || `${FRONTEND_URL}/about?scroll=faq-section`;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "support@nexguardlk.store";
const FACEBOOK_URL = process.env.FACEBOOK_URL || "https://facebook.com/nexguardlk";
const WHATSAPP_URL = process.env.WHATSAPP_URL || "https://wa.me/94770492554";
const TELEGRAM_URL = process.env.TELEGRAM_URL || "https://t.me/nexguardusagebot";

// --- Style Definitions (User Requested Changes) ---
const SITE_BLUE_COLOR = "#244ed9";      // Site Blue Color (Updated)
const MAIN_BG_COLOR = "#f8fef6";        // Main Background Color (Updated)
const TEXT_COLOR = "#333333";          // Main Text Color (Updated for light BG)
const SECONDARY_TEXT_COLOR = "#555555"; // Secondary Text Color (Updated for light BG)
const BORDER_COLOR = "#244ed9";        // Border Color (Updated)

// --- Main Email Template Generator (Updated Styles) ---
const generateEmailTemplate = (title, preheader, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <style>
        /* Basic Reset */
        body, html { margin: 0; padding: 0; width: 100%; -webkit-font-smoothing: antialiased; background-color: ${MAIN_BG_COLOR}; font-family: Inter, arial, sans-serif; } /* Updated Font & BG */
        table { border-collapse: collapse; }
        img { border: 0; max-width: 100%; height: auto; vertical-align: middle; }
        a { color: ${SITE_BLUE_COLOR}; text-decoration: underline; font-weight: 600; text-decoration-thickness: 1.5px; } /* Updated Blue, Font Weight & Underline */
        a:hover { text-decoration: underline; }
        p { margin: 0 0 14px; font-size: 15px; line-height: 24px; color: ${TEXT_COLOR}; font-weight: 500; } /* Updated Text Color, Line Height & Font Weight */
        strong { font-weight: 700;}
        .username-highlight { color: ${SITE_BLUE_COLOR}; font-weight: 700; }

        /* Layout */
        .wrapper { width: 100%; table-layout: fixed; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        .webkit { max-width: 580px; margin: 0 auto; background-color: ${MAIN_BG_COLOR}; } /* Updated BG */
        .outer { margin: 0 auto; width: 100%; max-width: 580px; }
        .inner { padding: 28px; }

        /* Header */
        .header { padding: 20px 0; text-align: center; }
        .logo { max-width: 140px; }

        /* Content Area */
        .content-title { font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 700; margin: 0 0 20px; color: ${SITE_BLUE_COLOR}; text-align: center; } /* Title Color to Site Blue */

        /* OTP Specific Style */
        .otp-box {
            /* background-color: #e0f2fe; Removed background */
            border: 2px solid ${SITE_BLUE_COLOR}; /* Use Site Blue for border */
            border-radius: 0; /* Updated */
            padding: 10px 8px; /* Updated */
            margin: 20px 0;
            text-align: center;
        }
        .otp-code {
            font-family: 'Orbitron', sans-serif;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 4px;
            color: ${SITE_BLUE_COLOR}; /* Updated Blue */
            margin: 0;
        }
        .validity-text { font-size: 13px; margin: 10px 0 20px; color: ${SECONDARY_TEXT_COLOR}; text-align: center; } /* Updated Text Color */

        /* Button Style */
        .button-link { background-color: ${SITE_BLUE_COLOR}; color: #ffffff !important; padding: 12px 24px; font-size: 15px; font-weight: 600; text-decoration: none !important; border-radius: 0; display: inline-block; font-family: 'Inter', sans-serif; border: none; cursor: pointer; text-align: center; mso-padding-alt: 0; text-underline-color: ${SITE_BLUE_COLOR}; } /* Updated Radius */
        .button-link:hover { background-color: #1e3a8a; }

        /* Help Section */
        .help-section { margin-top: 28px; padding-top: 20px; border-top: 1px solid ${BORDER_COLOR}; text-align: center; } /* Updated Border Color */
        .help-section p { margin-bottom: 6px; font-size: 13px; color: ${SECONDARY_TEXT_COLOR}; line-height: 1.5; } /* Updated Text Color */
        .help-section a { color: ${SITE_BLUE_COLOR}; text-decoration: underline; font-weight: 600; }

        /* Footer */
        .footer { padding: 28px 0 20px; text-align: center; font-size: 11px; color: ${SECONDARY_TEXT_COLOR}; } /* Updated Text Color */
        .social-icons img {
            width: 38px; height: 38px; /* Updated size */
            vertical-align: middle;
            border-radius: 50%; /* Updated to round */
            border: 2px solid ${SITE_BLUE_COLOR}; /* Blue border */
            padding: 2px;
            box-sizing: border-box;
        }
        .social-icons a { text-decoration: none; display: inline-block; margin: 0 6px; }

        /* Responsive */
        @media (max-width: 600px) {
            .webkit { width: 100% !important; max-width: 100% !important; }
            .outer { width: 100% !important; max-width: 100% !important; }
            .inner { padding: 18px !important; }
            .content-title { font-size: 19px; }
            .otp-code { font-size: 28px; letter-spacing: 3px; }
            p { font-size: 14px; line-height: 22px; }
            .button-link { padding: 10px 20px; font-size: 14px; }
            .social-icons img { width: 34px; height: 34px; } /* Slightly smaller on mobile */
            .social-icons a { margin: 0 4px; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: ${MAIN_BG_COLOR};">
    <div style="display: none; font-size: 1px; color: ${MAIN_BG_COLOR}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">${preheader}</div>

    <center class="wrapper" style="width: 100%; table-layout: fixed; background-color: ${MAIN_BG_COLOR}; padding-top: 20px; padding-bottom: 20px;">
        <div class="webkit" style="max-width: 580px; margin: 0 auto; background-color: ${MAIN_BG_COLOR}; border-radius: 0;">
            <table class="outer" align="center" style="margin: 0 auto; width: 100%; max-width: 580px; border-collapse: collapse; background-color: ${MAIN_BG_COLOR}; border-radius: 0;">
                <tr>
                    <td class="header" style="padding: 20px 0; text-align: center;">
                        <img src="${LOGO_URL}" width="140" alt="NexGuard Logo" class="logo">
                    </td>
                </tr>
                <tr>
                    <td class="inner" style="padding: 28px;">
                        <p class="content-title">${title}</p>
                        ${content}
                        <div class="help-section" style="margin-top: 28px; padding-top: 20px; border-top: 1px solid ${BORDER_COLOR}; text-align: center;">
                            <p style="margin-bottom: 6px; font-size: 13px; color: ${SECONDARY_TEXT_COLOR}; font-weight: 700;">We are here to help you</p>
                            <p style="margin-bottom: 6px; font-size: 13px; color: ${SECONDARY_TEXT_COLOR};">Visit our <a href="${HELP_CENTER_URL}" target="_blank">Help Center</a> for tutorials and FAQs.</p>
                            <p style="margin-bottom: 6px; font-size: 13px; color: ${SECONDARY_TEXT_COLOR};">Can't find an answer?</p>
                            <p style="margin-bottom: 6px; font-size: 13px; color: ${SECONDARY_TEXT_COLOR};">Email us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
                        </div>

                        <p style="margin: 25px 0 0; font-size: 13px; color: ${SECONDARY_TEXT_COLOR}; text-align: center;">Thank you,<br><strong style="color: ${TEXT_COLOR};">The NexGuard Team</strong></p> </td>
                </tr>
                <tr>
                    <td class="footer" style="padding: 28px 0 20px; text-align: center; font-size: 11px; color: ${SECONDARY_TEXT_COLOR};">
                        <p class="social-icons" style="margin-bottom: 14px;">
                            <a href="${FACEBOOK_URL}" target="_blank"><img src="https://img.icons8.com/ios-filled/64/244ed9/facebook-new.png" alt="Facebook"></a> <a href="${WHATSAPP_URL}" target="_blank"><img src="https://img.icons8.com/ios-filled/64/244ed9/whatsapp.png" alt="WhatsApp"></a> <a href="${TELEGRAM_URL}" target="_blank"><img src="https://img.icons8.com/ios-filled/64/244ed9/telegram-app.png" alt="Telegram"></a> </p>
                        <p style="margin: 0;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK. All rights reserved.</p>
                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>
</html>`;

// --- Button HTML Helper ---
const buttonHtml = (url, text) => `<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px auto;"><tr><td align="center" bgcolor="${SITE_BLUE_COLOR}" style="border-radius: 0;"><a href="${url}" target="_blank" class="button-link">${text}</a></td></tr></table>`;

// --- Content Generation Functions (Adjusted Text Colors) ---

const generateOtpEmailContent = (username, otp) => `
<p>Hello, <strong class="username-highlight">${username}</strong>!</p>
<p>Welcome to NexGuard! To complete your email verification, please use the One-Time Password (OTP) below.</p>
<div class="otp-box">
    <p class="otp-code">${otp}</p>
</div>
<p class="validity-text">This code is valid for 10 minutes. For your security, please do not share this code with anyone.</p>`;

const generatePasswordResetEmailContent = (username, resetLink) => `
<p>Hello, <strong class="username-highlight">${username}</strong>!</p>
<p>We received a request to reset the password for your NexGuard account. If this was you, click the button below to set a new password:</p>
${buttonHtml(resetLink, 'Reset Your Password')}
<p style="font-size: 13px; margin: 20px 0 0; color: ${SECONDARY_TEXT_COLOR}; text-align: center;">This password reset link is only valid for the next 10 minutes.</p>
<p style="font-size: 13px; margin: 6px 0 0; color: ${SECONDARY_TEXT_COLOR}; text-align: center;">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>`;

const generateApprovalEmailContent = (username, planId, finalUsername) => `
<p>Hello, <strong class="username-highlight">${username}</strong>!</p>
<p>Great news! Your NexGuard order for the <strong>${planId}</strong> plan has been successfully approved and activated.</p>
<div style="background-color: rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e; border-radius: 0; padding: 14px; margin: 20px 0;"> <p style="margin: 0 0 6px 0; font-size: 14px; color: ${SECONDARY_TEXT_COLOR};">Activated Plan: <strong style="color: ${TEXT_COLOR};">${planId}</strong></p> <p style="margin: 0; font-size: 14px; color: ${SECONDARY_TEXT_COLOR};">Your V2Ray Username: <strong style="color:${SITE_BLUE_COLOR}">${finalUsername}</strong></p>
</div>
<p>You can now log in to your profile to find your unique V2Ray connection link and start enjoying true internet freedom!</p>
${buttonHtml(`${FRONTEND_URL}/profile`, 'Go to My Profile')}
<p style="font-size: 13px; margin: 20px 0 0; color: ${SECONDARY_TEXT_COLOR};">If you have any questions, visit our Help Center or contact support.</p>`;

const generateOrderPlacedEmailContent = (username, planId) => `
<p>Hello, <strong class="username-highlight">${username}</strong>!</p>
<p>Thank you for your order! We've received your request for the <strong>${planId}</strong> plan and it's now pending review and approval.</p>
<div style="background-color: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; border-radius: 0; padding: 14px; margin: 20px 0;"> <p style="margin: 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 24px;">We'll notify you via email as soon as your plan is activated. This usually takes a few hours during business times. You can check the latest status of your order anytime in your profile.</p> </div>
${buttonHtml(`${FRONTEND_URL}/profile?tab=orders`, 'Check Order Status')}
<p style="font-size: 13px; margin: 20px 0 0; color: ${SECONDARY_TEXT_COLOR};">We appreciate your patience!</p>`;

const generateRejectionEmailContent = (username, planId, orderId) => `
<p>Hello, <strong class="username-highlight">${username}</strong>.</p>
<p>We're writing to inform you about your recent NexGuard order (ID: ${orderId}) for the <strong>${planId}</strong> plan.</p>
<div style="background-color: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; border-radius: 0; padding: 14px; margin: 20px 0;"> <p style="margin: 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 24px; font-weight: 500;">Unfortunately, we were unable to approve your order at this time.</p> <p style="margin: 8px 0 0; font-size: 14px; color: ${TEXT_COLOR}; line-height: 24px;">This is often due to an issue verifying the payment receipt. Please double-check the image you uploaded or contact our support team via WhatsApp for assistance.</p> </div>
<p style="font-size: 13px; margin: 20px 0 0; color: ${SECONDARY_TEXT_COLOR};">We apologize for any inconvenience.</p>`;

const generateExpiryReminderEmailContent = (username, v2rayUsername, expiryDate) => `
<p>Hello, <strong class="username-highlight">${username}</strong>!</p>
<p>Just a friendly reminder that your NexGuard plan associated with the username <strong style="color:${SITE_BLUE_COLOR}">${v2rayUsername}</strong> is set to expire soon.</p>
<div style="background-color: rgba(249, 115, 22, 0.1); border-left: 4px solid #f97316; border-radius: 0; padding: 14px; margin: 20px 0;"> <p style="margin: 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 24px;"><strong>Expires on:</strong> ${expiryDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })} (less than 24 hours)</p> </div>
<p>To ensure uninterrupted service, please renew your plan through your profile before the expiry time.</p>
${buttonHtml(`${FRONTEND_URL}/profile`, 'Renew Your Plan Now')}
<p style="font-size: 13px; margin: 20px 0 0; color: ${SECONDARY_TEXT_COLOR};">If you've already renewed, please disregard this message.</p>`;

const generateUserNotFoundEmailContent = (triedEmail) => `
<p>Hello,</p>
<p>You recently requested a password reset for the email address: <strong>${triedEmail}</strong>.</p>
<p>We couldn't find an account associated with this email address in our system.</p>
<p style="font-size: 13px; margin: 15px 0 0; color: ${SECONDARY_TEXT_COLOR}; text-align: center;">If you believe this is an error, please double-check the email address or contact support.</p>
<p style="font-size: 13px; margin: 6px 0 0; color: ${SECONDARY_TEXT_COLOR}; text-align: center;">If you didn't request this, you can safely ignore this email.</p>`;

// Export functions
module.exports = {
    sendEmail, // Uncommented and ready to use
    generateEmailTemplate,
    generateOtpEmailContent,
    generatePasswordResetEmailContent,
    generateApprovalEmailContent,
    generateOrderPlacedEmailContent,
    generateRejectionEmailContent,
    generateExpiryReminderEmailContent,
    generateUserNotFoundEmailContent,
};