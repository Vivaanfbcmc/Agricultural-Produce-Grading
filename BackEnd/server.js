require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");

// Routes
const authRoutes = require("./routes/auth");
const priceRoute = require("./PriceAPI/priceRoute");
const blockchainRoutes = require("./routes/blockchain");

// Database config
const { testConnections } = require("./config/database");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend
app.use(express.static(path.join(__dirname, "../FrontEnd")));

// Session Middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET || "agriculture-secret-key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/price", priceRoute);
app.use("/api/blockchain", blockchainRoutes);

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Agricultural Produce Grading System - Unified Backend Running",
        timestamp: new Date().toISOString(),
        version: "2.0.0"
    });
});

// Root endpoint
app.get("/", (req, res) => {
    res.json({
        message: "Agricultural Produce Grading System",
        version: "2.0.0",
        description: "Integrated Farmer Authentication + Blockchain Ledger",
        endpoints: {
            health: "/health",
            auth: {
                register: "POST /api/auth/register",
                login: "POST /api/auth/login",
                profile: "GET /api/auth/profile"
            },
            blockchain: {
                createTransaction: "POST /api/blockchain/transactions",
                getLedger: "GET /api/blockchain/ledger",
                verify: "GET /api/blockchain/verify",
                stats: "GET /api/blockchain/stats"
            },
            prices: "GET /api/price"
        }
    });
});

// Start server
const PORT = process.env.PORT || 5000;

(async () => {
    try {
        // Test database connections
        const connected = await testConnections();
        
        if (!connected && process.env.NODE_ENV === 'production') {
            console.error("❌ Could not connect to databases - exiting");
            process.exit(1);
        }

        if (!connected && process.env.NODE_ENV !== 'production') {
            console.warn("⚠️  Development mode: Starting without database connection");
        }

        app.listen(PORT, () => {
            console.log("\n╔════════════════════════════════════════════════════════╗");
            console.log("║  🚀 Agricultural Produce Grading System Running        ║");
            console.log("║     Unified Backend v2.0.0                            ║");
            console.log("╚════════════════════════════════════════════════════════╝");
            console.log(`\n📍 Server: http://localhost:${PORT}`);
            console.log(`📍 Health: http://localhost:${PORT}/health`);
            console.log("\n✅ Features Enabled:");
            console.log("  • Farmer Authentication (MySQL)");
            console.log("  • Blockchain Ledger (PostgreSQL)");
            console.log("  • Immutable Transaction Recording");
            console.log("  • Price API Integration");
            console.log("\n");
        });
    } catch (err) {
        console.error("❌ Server startup failed:", err);
        process.exit(1);
    }
})();

// Error handling
process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error.message);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
