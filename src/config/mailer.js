// File Path: src/config/mailer.js (Optimized for Speed)

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  pool: true, // <--- 1. මේක තමයි වේගය වැඩි කරන රහස (Connection Pooling)
  maxConnections: 5, // එකවර සම්බන්ධතා 5ක් තියාගන්නවා
  maxMessages: 100, // එක Connection එකකින් යවන උපරිම මැසේජ් ගණන
  
  host: process.env.ZOHO_HOST || "smtp.zoho.com",
  port: parseInt(process.env.ZOHO_PORT, 10) || 465,
  secure: true, // SSL
  auth: {
    user: process.env.ZOHO_USER, 
    pass: process.env.ZOHO_PASS, 
  },
  // Timeout settings වැඩි කිරීම (Connection කැඩෙන එක අඩු කරන්න)
  connectionTimeout: 10000, // අලුතින් එකතු කරන්න (තත්පර 10)
  socketTimeout: 30000,
});

// Verify connection
transporter.verify(function(error, success) {
  if (error) {
    console.error("❌ Zoho Mailer Error:", error);
  } else {
    console.log("✅ Zoho Mailer is ready (Pooled Connection).");
  }
});

module.exports = transporter;