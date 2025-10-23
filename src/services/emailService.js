// File Path: NexGuardLK/src/services/emailService.js (Fully Updated)

const transporter = require('../config/mailer'); // ඔබගේ mailer.js ගොනුවෙන් transporter එක import කිරීම

/**
 * Brevo Mail හරහා email යැවීම සඳහා වන ප්‍රධාන function එක. (Updated Log Message)
 * @param {string} to - ලබන්නාගේ email ලිපිනය
 * @param {string} subject - Email එකේ මාතෘකාව
 * @param {string} html - යැවිය යුතු HTML අන්තර්ගතය
 */
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"NexGuard LK" <${process.env.EMAIL_SENDER}>`, // .env ගොනුවේ ඇති ඔබගේ EMAIL_SENDER
            to,
            subject,
            html,
        });
        console.log('Email sent successfully via Brevo.'); // Updated log
    } catch (error) {
        console.error('Error sending email via Brevo:', error); // Updated log
        throw new Error('Failed to send email.');
    }
};

// --- HTML Template නිර්මාණය කිරීමේ කොටස (යාවත්කාලීන කරන ලදී) ---

const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.nexguardlk.store";
// Logo එකේ public URL එක මෙතනට දාන්න (ඔබේ server එකේ හෝ CDN එකක තියෙන)
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`; // ඔබ upload කළ logo.png එකට අදාළ path එක

/**
 * නව Minimal, Classic Email Template එක.
 * සැහැල්ලු කොළ background එකක් සහ නිල් අකුරු සහිතයි.
 */
const generateEmailTemplate = (title, preheader, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 100%; -webkit-font-smoothing: antialiased; background-color: #f0fdf4; /* Light Mint Green Background */ }
        .main-table { width: 100%; }
        .content-box {
            background-color: #ffffff; /* White content background */
            border: 1px solid #e2e8f0; /* Light gray border */
            border-radius: 8px; /* Slightly rounded corners */
            padding: 32px; /* Adjusted padding */
            text-align: left;
            color: #1e293b; /* Dark Slate default text color */
            font-family: 'Inter', sans-serif;
            max-width: 600px; /* Limit content width */
            margin: 0 auto; /* Center the content box */
        }
        .email-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 22px;
            font-weight: 700; /* Bolder title */
            margin: 0 0 24px;
            color: #1d4ed8; /* Stronger Blue title */
        }
        .email-content p {
            font-size: 16px;
            line-height: 1.6;
            margin: 0 0 16px;
            color: #334155; /* Medium Slate text */
        }
        .email-content strong {
            color: #1e293b; /* Darker bold text */
        }
        .email-footer {
            margin: 30px 0 0;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0; /* Light gray border */
            font-size: 13px;
            color: #64748b; /* Gray footer text */
        }
        .copyright {
            padding: 24px;
            text-align: center;
            font-size: 12px;
            color: #64748b; /* Gray copyright text */
            font-family: 'Inter', sans-serif;
        }
        a {
            color: #3b82f6; /* Standard Blue links */
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        /* Style for the button, defined separately */
        .button-link {
             background-color: #3b82f6; /* Standard Blue background */
             color: #ffffff !important; /* White text, important to override link color */
             padding: 12px 24px;
             font-size: 15px;
             font-weight: 600;
             text-decoration: none !important; /* Ensure no underline */
             border-radius: 6px;
             display: inline-block;
             font-family: 'Inter', sans-serif;
             border: none;
             cursor: pointer; /* Add pointer cursor */
             text-align: center;
        }
        .button-link:hover {
             background-color: #2563eb; /* Darker blue on hover */
             text-decoration: none !important; /* Ensure no underline on hover */
        }

        /* Responsive Styles */
        @media (max-width: 600px) {
            .content-box { padding: 24px !important; border-radius: 0; border-left: none; border-right: none; }
            .email-title { font-size: 20px; }
            .email-content p { font-size: 15px; }
            .main-table { padding: 16px 0 !important; } /* Reduce padding on mobile */
            td[align="center"] { padding: 16px !important; } /* Reduce main padding */
        }
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #f0fdf4;">
    <div style="display: none; font-size: 1px; color: #f0fdf4; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">${preheader}</div>
    <table class="main-table" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td align="center" style="padding: 24px 16px;">
                <!-- Logo -->
                <table style="width: 100%; max-width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                    <tr><td align="center" style="padding-bottom: 24px;"><img src="${LOGO_URL}" width="150" alt="NexGuard Logo" style="max-width: 150px; height: auto; border: 0;"></td></tr>
                </table>
                <!-- Content Box -->
                <table class="content-box" style="width: 100%; max-width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                        <td style="padding: 32px;">
                            <p class="email-title">${title}</p>
                            <div class="email-content">
                                ${content} <!-- Specific email content goes here -->
                            </div>
                            <p class="email-footer">Thank you,<br>The NexGuard Team</p>
                        </td>
                    </tr>
                </table>
                <!-- Copyright -->
                <table style="width: 100%; max-width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                    <tr><td class="copyright"><p style="margin: 0;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK.</p></td></tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

// --- Button Style (Variable for easier use in content functions) ---
// Classic solid blue button
const buttonStyle = `background-color: #3b82f6; color: #ffffff; padding: 12px 24px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-family: 'Inter', sans-serif; border: none;`;
const buttonHtml = (url, text) => `<a href="${url}" target="_blank" style="${buttonStyle}">${text}</a>`; // Helper function to generate button HTML

// --- Content Generation Functions (Using new button style) ---

const generateOtpEmailContent = (otp) => `
<p>Your One-Time Password (OTP) is below. Use this code to complete your verification.</p>
<div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
    <p style="font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 700; letter-spacing: 4px; margin: 0; color: #1d4ed8;">${otp}</p>
</div>
<p style="font-size: 14px; margin: 0; color: #64748b;">This code is valid for 10 minutes.</p>`;

const generatePasswordResetEmailContent = (username, resetLink) => `
<p>Hello, <strong>${username}</strong>! We received a request to reset your password. Click the button below to continue.</p>
<div style="text-align: center; margin: 24px 0;">
    ${buttonHtml(resetLink, 'Reset Password')}
</div>
<p style="font-size: 14px; margin: 24px 0 0; color: #64748b;">This link is valid for 10 minutes. If you didn't request this, please ignore this email.</p>`;

const generateApprovalEmailContent = (username, planId, finalUsername) => `
<p>Congratulations, <strong>${username}</strong>! Your NexGuard plan has been approved.</p>
<div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">PLAN: <strong>${planId}</strong></p>
    <p style="margin: 0; font-size: 14px; color: #64748b;">V2RAY USERNAME: <strong>${finalUsername}</strong></p>
</div>
<p>Log in to your profile to get your connection link.</p>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile`, 'Go to My Profile')}
</div>`;

const generateOrderPlacedEmailContent = (username, planId) => `
<p>Hello, <strong>${username}</strong>! We've received your order for the <strong>${planId}</strong> plan. It's now pending approval.</p>
<div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 16px; color: #334155;">You'll get another email once your plan is active. You can check your order status on your profile.</p>
</div>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile?tab=orders`, 'Check Order Status')}
</div>`;

const generateRejectionEmailContent = (username, planId, orderId) => `
<p>Hello, <strong>${username}</strong>. We regret to inform you that your order (ID: ${orderId}) for the <strong>${planId}</strong> plan has been rejected.</p>
<div style="background-color: #fee2e2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 16px; color: #334155;">This could be due to an issue with the payment receipt. Please contact our support team on WhatsApp for clarification.</p>
</div>`;

const generateExpiryReminderEmailContent = (username, v2rayUsername, expiryDate) => `
<p>Hello, <strong>${username}</strong>. This is a reminder that your plan for user <strong>${v2rayUsername}</strong> will expire in less than 24 hours.</p>
<div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 16px; color: #334155;"><strong>Expires on:</strong> ${expiryDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
</div>
<p>To avoid service interruption, please renew your plan from your profile.</p>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile`, 'Renew Your Plan')}
</div>`;

// අනෙකුත් files වලට මෙම functions භාවිතා කිරීමට export කිරීම
module.exports = {
    sendEmail,
    generateEmailTemplate,
    generateOtpEmailContent,
    generatePasswordResetEmailContent,
    generateApprovalEmailContent,
    generateOrderPlacedEmailContent,
    generateRejectionEmailContent,
    generateExpiryReminderEmailContent,
    buttonStyle // Exporting the style string itself might be useful
};
