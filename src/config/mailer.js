// File Path: src/config/mailer.js (UPDATED AND CORRECTED)

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  pool: true, // Enable connection pooling
  host: process.env.ZOHO_HOST,
  port: parseInt(process.env.ZOHO_PORT, 10),
  secure: true, // Use TLS
  maxConnections: 5, // Limit the number of concurrent connections to 5
  maxMessages: 100,  // Send up to 100 messages per connection before creating a new one
  rateLimit: 10,     // Send at most 10 messages per second
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

module.exports = transporter;