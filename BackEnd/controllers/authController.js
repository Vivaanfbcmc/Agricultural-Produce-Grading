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
    const { fname, lname, phone, email, password, state, district} = req.body;

    try {
        if (!fname || !lname || !phone || !password || !state || !district) {
            return res.status(400).json({
                message: "All required fields must be filled"
            });
        }

        if (!validateName(fname)) {
            return res.status(400).json({
                message: "First name must contain only letters and be 2-50 characters"
            });
        }

        if (!validateName(lname)) {
            return res.status(400).json({
                message: "Last name must contain only letters and be 2-50 characters"
            });
        }

        if (!validatePhone(phone)) {
            return res.status(400).json({
                message: "Invalid phone number. Must be 10 digits starting with 6-9"
            });
        }

        if (email && !validateEmail(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long"
            });
        }

        if (state.length < 2 || state.length > 50) {
            return res.status(400).json({
                message: "Invalid state"
            });
        }

        if (district.length < 2 || district.length > 50) {
            return res.status(400).json({
                message: "Invalid district"
            });
        }

        // Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            "INSERT INTO farmers (fname, lname, phone, email, hashedPassword, state, district) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [fname, lname, phone, email, hashedPassword, state, district]
        );

        res.status(201).json({
            message: "Account created successfully"
        });

    } catch (err) {
        console.error('Register error:', err);

        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Phone number or email already registered"
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
        if (!phone || !password) {
            return res.status(400).json({
                message: "Phone and password are required"
            });
        }

        if (!validatePhone(phone)) {
            return res.status(400).json({
                message: "Invalid phone number format"
            });
        }

        const [rows] = await db.query(
            "SELECT * FROM farmers WHERE phone = ?",
            [phone]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Invalid phone or password"
            });
        }

        const farmer = rows[0];

        // Verify password against hash
        const isPasswordValid = await bcrypt.compare(
            password,
            farmer.hashedPassword
        );



        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid phone or password"
            });
        }

        // Don't send password in response
        delete farmer.password;

        res.json({
            message: "Login successful!",
            farmer: farmer
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
};