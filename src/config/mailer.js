// File Path: src/config/mailer.js (Updated for Zoho Mail)

const nodemailer = require("nodemailer");

// Zoho Mail SMTP configuration
const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_HOST || "smtp.zoho.com", // Zoho SMTP host (ඔබගේ කලාපය අනුව .com, .eu, .in විය හැක)
  port: parseInt(process.env.ZOHO_PORT, 10) || 465, // Zoho SMTP port (SSL/TLS සඳහා 465)
  secure: true, // true for port 465 (SSL/TLS)
  auth: {
    user: process.env.ZOHO_USER, // Your Zoho email address
    pass: process.env.ZOHO_PASS, // Your Zoho App-Specific Password
  },
});

// Verify connection configuration (Optional but recommended)
transporter.verify(function(error, success) {
  if (error) {
    console.error("Zoho Mailer Configuration Error:", error);
  } else {
    console.log("Zoho Mailer is ready to send emails.");
  }
});

module.exports = transporter;