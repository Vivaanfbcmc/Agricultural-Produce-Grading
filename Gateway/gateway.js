// gateway.js - API Gateway (God Server)
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your-secret-key-here',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 24 hours
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    })
);

// Serve static files (Frontend) - Multiple directories for different assets
app.use(express.static(path.join(__dirname, '../FrontEnd')));
app.use(express.static(path.join(__dirname, '../FrontEnd/SIGN_in_Page')));
app.use(express.static(path.join(__dirname, '../FrontEnd/Main_AI_DashBoard')));
app.use('/images', express.static(path.join(__dirname, '../FrontEnd/images')));

// Service URLs - Internal server-to-server communication
const SERVICES = {
    AUTH: process.env.AUTH_SERVICE_URL || 'http://localhost:5000',
    ML: process.env.ML_SERVICE_URL || 'http://localhost:5001',
    PRICE: process.env.PRICE_SERVICE_URL || 'http://localhost:3001',
    BLOCKCHAIN: process.env.BLOCKCHAIN_SERVICE_URL || 'http://localhost:3000'
};

// ==================== UTILITY FUNCTIONS ====================

async function forwardRequest(serviceUrl, path, options = {}) {
    try {
        const url = `${serviceUrl}${path}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Content-Type': options.headers?.['Content-Type'] || 'application/json'
            }
        });

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        return {
            status: response.status,
            ok: response.ok,
            data
        };
    } catch (error) {
        console.error(`Error forwarding request to ${serviceUrl}${path}:`, error.message);
        return {
            status: 503,
            ok: false,
            data: { error: 'Service unavailable', message: error.message }
        };
    }
}

// ==================== AUTHENTICATION ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    const result = await forwardRequest(SERVICES.AUTH, '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const result = await forwardRequest(SERVICES.AUTH, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    // If login successful, set session
    if (result.ok && result.data.user) {
        req.session.isAuth = true;
        req.session.user = result.data.user;
    }

    res.status(result.status).json(result.data);
});

// Get Profile
app.get('/api/auth/profile', async (req, res) => {
    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({ user: req.session.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// ==================== ML SERVICE ROUTES ====================

// Analyze Image
app.post('/api/ml/analyze', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    try {
        // Create form data for forwarding to ML service
        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await fetch(`${SERVICES.ML}/analyze`, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        const data = await response.json();
        res.status(response.status).json(data);

    } catch (error) {
        console.error('ML service error:', error.message);
        res.status(500).json({
            success: false,
            message: 'ML service unavailable'
        });
    }
});

// ==================== PRICE API ROUTES ====================

// Get Price
app.post('/api/price', async (req, res) => {
    const result = await forwardRequest(SERVICES.PRICE, '/price', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
});

// ==================== BLOCKCHAIN ROUTES ====================

// Create Transaction
app.post('/api/blockchain/transactions', async (req, res) => {
    // Support both session-based auth and direct farmerId in request body
    let transactionData = { ...req.body };
    
    if (req.session.isAuth && req.session.user) {
        // If authenticated via session, add verified session info
        transactionData = {
            ...transactionData,
            farmer_id: req.session.user.farmerId,
            farmerName: req.session.user.fullName
        };
    } else {
        // Direct request with farmer_id provided
        if (!transactionData.farmer_id) {
            return res.status(400).json({ error: 'farmer_id is required' });
        }
    }

    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/transactions', {
        method: 'POST',
        body: JSON.stringify(transactionData)
    });

    res.status(result.status).json(result.data);
});

// Get Ledger
app.get('/api/blockchain/ledger', async (req, res) => {
    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/ledger', {
        method: 'GET'
    });

    res.status(result.status).json(result.data);
});

// Verify Ledger
app.get('/api/blockchain/verify', async (req, res) => {
    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/ledger/verify', {
        method: 'GET'
    });

    res.status(result.status).json(result.data);
});

// Get Transaction History (for logged-in user)
app.get('/api/blockchain/history', async (req, res) => {
    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Forward request with farmer ID filter
    const farmerId = req.session.user.farmerId;
    const result = await forwardRequest(
        SERVICES.BLOCKCHAIN,
        `/api/transactions?farmerId=${farmerId}`,
        { method: 'GET' }
    );

    res.status(result.status).json(result.data);
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
    const health = {
        gateway: 'healthy',
        timestamp: new Date().toISOString(),
        services: {}
    };

    // Check each service
    const checks = Object.entries(SERVICES).map(async ([name, url]) => {
        try {
            const response = await fetch(`${url}/health`, {
                timeout: 3000
            }).catch(() => null);

            health.services[name.toLowerCase()] = response?.ok
                ? 'healthy'
                : 'unhealthy';
        } catch {
            health.services[name.toLowerCase()] = 'unreachable';
        }
    });

    await Promise.all(checks);

    const allHealthy = Object.values(health.services).every(s => s === 'healthy');
    res.status(allHealthy ? 200 : 503).json(health);
});

// ==================== FRONTEND ROUTES ====================

// Serve main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../FrontEnd/SIGN_in_Page/Index.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../FrontEnd/Main_AI_DashBoard/AIIndex.html'));
});

app.get('/profile', (req, res) => {
    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../FrontEnd/Main_AI_DashBoard/profile.html'));
});

app.get('/history', (req, res) => {
    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../FrontEnd/Main_AI_DashBoard/history.html'));
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error('Gateway error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==================== START SERVER ====================

const PORT = process.env.GATEWAY_PORT || 4000;

app.listen(PORT, () => {
    console.log('\nForwarding to services:');
    console.log(`  Auth:       ${SERVICES.AUTH}`);
    console.log(`  ML:         ${SERVICES.ML}`);
    console.log(`  Price:      ${SERVICES.PRICE}`);
    console.log(`  Blockchain: ${SERVICES.BLOCKCHAIN}`);
    console.log(`GOD SERVER (Gateway URL): http://localhost:${PORT}`);
    console.log(`One Server to rule them all`)
});

export default app;