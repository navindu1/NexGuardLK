const nodemailer = require("nodemailer");

// Zoho Mail SMTP Configuration
// වැදගත්: .env ගොනුවේ ZOHO_USER සහ ZOHO_PASS තිබිය යුතුය.
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465, // 465 for SSL (Secure)
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.ZOHO_USER, // ඔබේ Zoho Email ලිපිනය
        pass: process.env.ZOHO_PASS,   // ඔබේ Zoho Password හෝ App Password
    },
    tls: {
        // Vercel එකේදී ඇතිවිය හැකි certificate ප්‍රශ්න මඟහරවා ගැනීමට
        rejectUnauthorized: false
    }
});

// Connection එක වැඩදැයි පරීක්ෂා කිරීම (Optional - for debugging)
transporter.verify(function (error, success) {
    if (error) {
        console.log("SMTP Connection Error:", error);
    } else {
        console.log("SMTP Server is ready to take our messages via Zoho Mail");
    }
});

module.exports = transporter;