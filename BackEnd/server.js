import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.routes.js";
import priceRoute from "./PriceAPI/priceRoute.js";
import db from "./db/connect.js";

const app = express();

// __dirname replacement (ESM does NOT have it))
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Serve Frontend
app.use(express.static(path.join(__dirname, "../FrontEnd")));

// Session Middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 24 hours
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/price", priceRoute);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

// Start server after DB check
(async () => {
    try {
        await db.query("SELECT 1");
        console.log("PostgreSQL database connected successfully");

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () =>
            console.log(`Server running on http://localhost:${PORT}`)
        );
    } catch (err) {
        console.error("DB connection failed:", err);
        process.exit(1);
    }
})();