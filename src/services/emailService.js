// File Path: NexGuardLK/src/services/emailService.js (Fully Updated - v3)

const transporter = require('../config/mailer');

/**
 * Brevo Mail හරහා email යැවීම සඳහා වන ප්‍රධාන function එක.
 * @param {string} to - ලබන්නාගේ email ලිපිනය
 * @param {string} subject - Email එකේ මාතෘකාව
 * @param {string} html - යැවිය යුතු HTML අන්තර්ගතය
 */
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: `"NexGuard LK" <${process.env.EMAIL_SENDER}>`,
            to,
            subject,
            html,
        });
        console.log('Email sent successfully via Brevo.');
    } catch (error) {
        console.error('Error sending email via Brevo:', error);
        throw new Error('Failed to send email.');
    }
};

// --- Configuration ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.nexguardlk.store";
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;
const HELP_CENTER_URL = process.env.HELP_CENTER_URL || `${FRONTEND_URL}/about`; // Example: Link to your About page or a dedicated help section
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "support@nexguardlk.store"; // Example: Your support email

/**
 * නව Minimal, Classic Email Template එක (Brevo style layout).
 * සම්පූර්ණ email එකට සැහැල්ලු කොළ background එකක් සහ නිල් අකුරු සහිතයි.
 */
const generateEmailTemplate = (title, preheader, content, username = "User") => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 100%; -webkit-font-smoothing: antialiased; background-color: #f0fdf4; /* Light Mint Green Background */ font-family: 'Inter', sans-serif; color: #334155; /* Default text color */ }
        .email-container { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
        .email-header { text-align: center; padding-bottom: 24px; }
        .email-body { background-color: transparent; /* No white box */ padding: 24px 0; } /* Padding around content */
        .email-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 24px; /* Slightly larger title */
            font-weight: 700;
            margin: 0 0 20px;
            color: #1d4ed8; /* Stronger Blue title */
            text-align: center; /* Centered headline */
        }
        .greeting {
            font-size: 16px;
            line-height: 1.6;
            margin: 0 0 20px;
            color: #1e293b; /* Darker text for greeting */
        }
        .email-content p {
            font-size: 15px; /* Slightly smaller body text */
            line-height: 1.6;
            margin: 0 0 16px;
            color: #334155; /* Medium Slate text */
        }
        .email-content strong {
            color: #1e293b; /* Darker bold text */
        }
        .signature {
            margin: 30px 0 0;
            font-size: 15px;
            line-height: 1.6;
            color: #334155;
        }
        .help-section {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #d1fae5; /* Lighter border matching background tone */
            text-align: center;
            font-size: 14px;
            color: #475569; /* Slightly darker gray for help section */
        }
        .help-section h3 {
             font-size: 16px;
             font-weight: 700;
             color: #1e293b;
             margin: 0 0 8px;
        }
        .help-section p { margin: 0 0 10px; line-height: 1.5; }
        .copyright {
            padding: 24px 0 0;
            text-align: center;
            font-size: 12px;
            color: #64748b; /* Gray copyright text */
        }
        a {
            color: #3b82f6; /* Standard Blue links */
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .button-link { /* Brevo style button */
             background-color: #1e293b; /* Dark Slate background */
             color: #ffffff !important; /* White text */
             padding: 12px 28px; /* Brevo padding */
             font-size: 15px;
             font-weight: 500; /* Medium weight */
             text-decoration: none !important;
             border-radius: 4px; /* Brevo border radius */
             display: inline-block;
             font-family: 'Inter', sans-serif;
             border: none;
             cursor: pointer;
             text-align: center;
             transition: background-color 0.2s ease;
        }
        .button-link:hover {
             background-color: #334155; /* Slightly lighter on hover */
             text-decoration: none !important;
        }

        /* Responsive Styles */
        @media (max-width: 600px) {
            .email-container { padding: 16px 8px; }
            .email-title { font-size: 20px; }
            .greeting, .email-content p, .signature { font-size: 14px; }
            .help-section { font-size: 13px; }
            .help-section h3 { font-size: 15px; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #f0fdf4;">
    <div style="display: none; font-size: 1px; color: #f0fdf4; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">${preheader}</div>
    <table class="email-container" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td>
                <div class="email-header">
                    <a href="${FRONTEND_URL}" target="_blank">
                        <img src="${LOGO_URL}" width="150" alt="NexGuard Logo" style="max-width: 150px; height: auto; border: 0;">
                    </a>
                </div>

                <div class="email-body">
                    <p class="email-title">${title}</p>
                    <p class="greeting">Hello ${username},</p>
                    <div class="email-content">
                        ${content} </div>
                    <p class="signature">Best regards,<br>The NexGuard Team</p>
                </div>

                <div class="help-section">
                   <h3>We are here to help you</h3>
                   <p>Visit our <a href="${HELP_CENTER_URL}" target="_blank">Help Center</a> to explore our handy tutorials and FAQs.</p>
                   <p>Can't find what you're looking for?<br>Email us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
                </div>

                <div class="copyright">
                    <p style="margin: 0;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK.</p>
                    </div>
            </td>
        </tr>
    </table>
</body>
</html>`;

// --- Button Style (Variable for easier use in content functions) ---
// Brevo style button (dark background)
const buttonStyle = `background-color: #1e293b; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 500; text-decoration: none; border-radius: 4px; display: inline-block; font-family: 'Inter', sans-serif; border: none;`;
const buttonHtml = (url, text) => `<a href="${url}" target="_blank" style="${buttonStyle}">${text}</a>`; // Helper function

// --- Content Generation Functions ---
// (Important: Remove "Hello username" and "Thank you" parts from these functions,
// as they are now handled by the main generateEmailTemplate)

const generateOtpEmailContent = (otp) => `
<p>Your One-Time Password (OTP) is below. Use this code to complete your verification.</p>
<div style="background-color: #e0e7ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
    <p style="font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 700; letter-spacing: 4px; margin: 0; color: #1d4ed8;">${otp}</p>
</div>
<p style="font-size: 14px; margin: 0; color: #64748b;">This code is valid for 10 minutes.</p>`;

const generatePasswordResetEmailContent = (resetLink) => `
<p>We received a request to reset your password. Click the button below to continue.</p>
<div style="text-align: center; margin: 24px 0;">
    ${buttonHtml(resetLink, 'Reset Password')}
</div>
<p style="font-size: 14px; margin: 24px 0 0; color: #64748b;">This link is valid for 10 minutes. If you didn't request this, please ignore this email.</p>`;

const generateApprovalEmailContent = (planId, finalUsername) => `
<p>Congratulations! Your NexGuard plan has been approved.</p>
<div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;">PLAN: <strong>${planId}</strong></p>
    <p style="margin: 0; font-size: 14px; color: #475569;">V2RAY USERNAME: <strong>${finalUsername}</strong></p>
</div>
<p>Log in to your profile to get your connection link.</p>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile`, 'Go to My Profile')}
</div>`;

const generateOrderPlacedEmailContent = (planId) => `
<p>We've received your order for the <strong>${planId}</strong> plan. It's now pending approval.</p>
<div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 15px; color: #475569;">You'll get another email once your plan is active. You can check your order status on your profile.</p>
</div>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile?tab=orders`, 'Check Order Status')}
</div>`;

const generateRejectionEmailContent = (planId, orderId) => `
<p>We regret to inform you that your order (ID: ${orderId}) for the <strong>${planId}</strong> plan has been rejected.</p>
<div style="background-color: #fee2e2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 15px; color: #475569;">This could be due to an issue with the payment receipt. Please contact our support team on WhatsApp for clarification.</p>
</div>`;

const generateExpiryReminderEmailContent = (v2rayUsername, expiryDate) => `
<p>This is a reminder that your plan for user <strong>${v2rayUsername}</strong> will expire in less than 24 hours.</p>
<div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-size: 15px; color: #475569;"><strong>Expires on:</strong> ${expiryDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
</div>
<p>To avoid service interruption, please renew your plan from your profile.</p>
<div style="text-align: center; margin-top: 24px;">
    ${buttonHtml(`${FRONTEND_URL}/profile`, 'Renew Your Plan')}
</div>`;

// අනෙකුත් files වලට මෙම functions භාවිතා කිරීමට export කිරීම
module.exports = {
    sendEmail,
    generateEmailTemplate,
    // Content functions (Ensure these only return the body content, not full HTML)
    generateOtpEmailContent,
    generatePasswordResetEmailContent,
    generateApprovalEmailContent,
    generateOrderPlacedEmailContent,
    generateRejectionEmailContent,
    generateExpiryReminderEmailContent,
    buttonHtml // Exporting the button helper function
};