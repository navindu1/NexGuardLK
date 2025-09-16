// File Path: server.js

const express = require("express");
const path = require("path");
const cron = require("node-cron");
const { cleanupOldReceipts } = require("./src/services/cronService"); // Cron job logic
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// API Routes
const apiRoutes = require("./src/routes");
app.use("/api", apiRoutes);

// --- ADD THIS NEW ROUTE FOR THE ADMIN LOGIN PAGE ---
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});
// --- END OF NEW ROUTE ---


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folders
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// API Routes
const apiRoutes = require("./src/routes");
app.use("/api", apiRoutes);

// Cron Job for cleaning up old receipts
cron.schedule("5 0 * * *", () => {
  console.log("Running scheduled task: Deleting old receipts...");
  cleanupOldReceipts();
});

// Frontend Route Handler (This should be the last route)
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;