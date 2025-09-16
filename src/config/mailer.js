// File Path: src/config/mailer.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_HOST,
  port: parseInt(process.env.ZOHO_PORT, 10),
  secure: true,
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

module.exports = transporter; 