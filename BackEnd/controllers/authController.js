const db = require("../db/connect");

exports.register = async (req, res) => {
    const { fname, lname, phone, email, password, state, district, veg_type } = req.body;

    try {
        await db.query(
            "INSERT INTO farmers (fname, lname, phone, email, password, state, district) VALUES ( ?, ?, ?, ?, ?, ?, ?)",
            [fname, lname, phone, email, password, state, district]
        );

        res.status(201).json({ message: "Account created successfully" });

    } catch (err) {
        console.error('Register error:', err);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Phone number already registered"
            });
        }

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


exports.login = async (req, res) => {
    const { phone, password } = req.body;
    try {
        const [rows] = await db.query(
            "SELECT * FROM farmers WHERE phone=? AND password=?",
            [phone, password]
        );

        if (rows.length === 0)
            return res.status(400).json({ message: "Invalid phone or password" });

        res.json({ message: "Login success!", farmer: rows[0] });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
