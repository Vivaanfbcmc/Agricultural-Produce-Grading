import db from '../db/connect.js';
import bcrypt from 'bcrypt';
import ValidationService from '../services/validation.service.js';

class AuthController {
    static async register(req, res) {
        const { fname, lname, phone, email, password, state, district } = req.body;

        try {
            if (!fname || !lname || !phone || !password || !state || !district) {
                return res.status(400).json({ error: 'All required fields must be filled' });
            }

            if (!ValidationService.validateName(fname)) {
                return res.status(400).json({ error: 'Invalid first name' });
            }

            if (!ValidationService.validateName(lname)) {
                return res.status(400).json({ error: 'Invalid last name' });
            }

            if (!ValidationService.validatePhone(phone)) {
                return res.status(400).json({ error: 'Invalid phone number' });
            }

            if (email && !ValidationService.validateEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            if (!ValidationService.validatePassword(password)) {
                return res.status(400).json({ error: 'Password too short' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            // Generate unique farmer ID
            const farmerId = `F${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
            const fullName = `${fname} ${lname}`;
            const location = `${district}, ${state}`;

            const result = await db.query(
                `INSERT INTO farmers (id, name, location, phone, email, password, state, district)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, name, phone, email, location, state, district`,
                [farmerId, fullName, location, phone, email || null, hashedPassword, state, district]
            );

            res.status(201).json({
                message: 'Account created successfully',
                farmer: result.rows[0]
            });

        } catch (error) {
            if (error.code === '23505') { // PostgreSQL unique constraint violation
                return res.status(409).json({ error: 'User already exists' });
            }
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    static async login(req, res) {
        const { phone, password } = req.body;

        try {
            if (!phone || !password) {
                return res.status(400).json({ error: 'Phone and password required' });
            }

            if (!ValidationService.validatePhone(phone)) {
                return res.status(400).json({ error: 'Invalid phone format' });
            }

            const result = await db.query(
                'SELECT * FROM farmers WHERE phone = $1',
                [phone]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const farmer = result.rows[0];

            const isPasswordValid = await bcrypt.compare(password, farmer.password);

            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            req.session.isAuth = true;
            req.session.user = {
                farmerId: farmer.id,
                fullName: farmer.name,
                contact: farmer.phone,
                email: farmer.email,
                location: farmer.location,
                state: farmer.state,
                district: farmer.district
            };

            res.json({
                message: 'Login successful',
                user: req.session.user
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    static async getProfile(req, res) {
        try {
            if (!req.session.isAuth || !req.session.user) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            res.json({ user: req.session.user });
        } catch (error) {
            console.error('Profile retrieval error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
}

export default AuthController;