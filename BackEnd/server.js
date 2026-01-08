require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const authRoutes = require("./routes/auth");
const priceRoute = require("./PriceAPI/priceRoute");
const db = require("./db/connect");

const app = express();


app.use(express.json());

// Serve Frontend
app.use(express.static(path.join(__dirname, "../FrontEnd")));

// Session Middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/price", priceRoute);

// Start server after DB check
(async () => {
    try {
        await db.query("SELECT 1");
        app.listen(5000, () =>
            console.log("Server running on http://localhost:5000")
        );
    } catch (err) {
        console.error("DB connection failed:", err);
        process.exit(1);
    }
})();
