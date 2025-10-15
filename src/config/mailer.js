// File Path: src/config/mailer.js (UPDATED FOR BREVO)

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  pool: true,
  host: process.env.BREVO_HOST, // e.g., 'smtp-relay.brevo.com'
  port: parseInt(process.env.BREVO_PORT, 10), // e.g., 587
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.BREVO_USER, // Your Brevo login email
    pass: process.env.BREVO_PASS, // Your Brevo SMTP key
  },
});

module.exports = transporter;