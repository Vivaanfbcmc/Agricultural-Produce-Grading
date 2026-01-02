const db = require("../db/connect");
const bcrypt = require("bcrypt");

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

const validateName = (name) => {
    const nameRegex = /^[a-zA-Z\s]{2,50}$/;
    return nameRegex.test(name);
};

exports.register = async (req, res) => {
    const { fname, lname, phone, email, password, state, district } = req.body;

    try {
        if (!fname || !lname || !phone || !password || !state || !district) {
            return res.status(400).json({ message: "All required fields must be filled" });
        }

        if (!validateName(fname)) {
            return res.status(400).json({ message: "Invalid first name" });
        }

        if (!validateName(lname)) {
            return res.status(400).json({ message: "Invalid last name" });
        }

        if (!validatePhone(phone)) {
            return res.status(400).json({ message: "Invalid phone number" });
        }

        if (email && !validateEmail(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ message: "Password too short" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO farmers (fname, lname, phone, email, hashedPassword, state, district) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [fname, lname, phone, email, hashedPassword, state, district]
        );

        res.status(201).json({ message: "Account created successfully" });

    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "User already exists" });
        }

        res.status(500).json({ message: "Server error" });
    }
};

exports.login = async (req, res) => {
    const { phone, password } = req.body;

    try {
        if (!phone || !password) {
            return res.status(400).json({ message: "Phone and password required" });
        }

        if (!validatePhone(phone)) {
            return res.status(400).json({ message: "Invalid phone format" });
        }

        const [rows] = await db.query(
            "SELECT * FROM farmers WHERE phone = ?",
            [phone]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const farmer = rows[0];

        const isPasswordValid = await bcrypt.compare(password, farmer.hashedPassword);

        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        req.session.isAuth = true;
        req.session.user = {
            farmerId: farmer.id,
            fullName: `${farmer.fname} ${farmer.lname}`,
            contact: farmer.phone,
            email: farmer.email,
            state: farmer.state,
            district: farmer.district
        };

        res.json({ message: "Login successful" });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};