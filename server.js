// File Path: server.js

const express = require("express");
const path = require("path");
const cron = require("node-cron");
const { cleanupOldReceipts } = require("./src/services/cronService");
const { checkAndApprovePendingOrders } = require("./src/services/orderService"); // <-- ADD THIS
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folders
app.use(express.static(path.join(process.cwd(), "public")));

// --- API Routes ---
const apiRoutes = require("./src/routes");
app.use("/api", apiRoutes);

// --- Custom Page Routes ---
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/reseller/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reseller-login.html"));
});

app.get("/reseller", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reseller.html"));
});

// --- Cron Jobs ---
// Runs at midnight every day to clean receipts
cron.schedule("5 0 * * *", () => {
  console.log("Running scheduled task: Deleting old receipts...");
  cleanupOldReceipts();
});

// Runs every minute to check for orders to auto-approve
cron.schedule("* * * * *", () => {
    console.log("Running scheduled task: Checking for pending orders to auto-approve...");
    checkAndApprovePendingOrders();
});


// --- Frontend Catch-All Route (This MUST be the last route) ---
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;