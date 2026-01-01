const express = require("express");
const cors = require("cors");
const app = express();
const authRoutes = require("./routes/auth");
const priceRoute = require('./PriceAPI/priceRoute');
const db = require("./db/connect");

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use('/api/price', priceRoute);

// Before starting, verify DB connectivity so errors are visible immediately
(async () => {
    try {
        // simple query to verify connection
        await db.query('SELECT 1');
        app.listen(5000, () => console.log("Server running on port 5000"));
    } catch (err) {
        console.error('Unable to connect to database at startup:', err);
        process.exit(1);
    }
})();
