const express = require("express");
const cors = require("cors");
const app = express();
const authRoutes = require("./routes/auth");

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);

// Start server
app.listen(5000, () => console.log("Server running on port 5000"));
