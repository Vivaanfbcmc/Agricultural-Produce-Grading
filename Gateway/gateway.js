// gateway.js - API Gateway (God Server) - WITH DEBUG LOGGING
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

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

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

// Serve static files (Frontend) - Multiple directories
const frontendPath = path.join(__dirname, '../FrontEnd');
const signinPath = path.join(__dirname, '../FrontEnd/SIGN_in_Page');
const dashboardPath = path.join(__dirname, '../FrontEnd/Main_AI_DashBoard');
const imagesPath = path.join(__dirname, '../FrontEnd/images');

console.log('Static file paths:');
console.log('  Frontend:', frontendPath);
console.log('  Sign-in:', signinPath);
console.log('  Dashboard:', dashboardPath);
console.log('  Images:', imagesPath);

app.use(express.static(frontendPath));
app.use(express.static(signinPath));
app.use(express.static(dashboardPath));
app.use('/images', express.static(imagesPath));

// CEDA Smart Price (port 3002)
app.post('/api/ceda-price', async (req, res) => {
    console.log(' CEDA Price request:', req.body);
    const result = await forwardRequest(
        process.env.CEDA_SERVICE_URL || 'http://localhost:3002',
        '/price',
        {
            method: 'POST',
            body: JSON.stringify(req.body)
        }
    );
    res.status(result.status).json(result.data);
});


// Service URLs - Internal server-to-server communication
const SERVICES = {
    AUTH: process.env.AUTH_SERVICE_URL || 'http://localhost:5000',
    ML: process.env.ML_SERVICE_URL || 'http://localhost:5001',
    PRICE: process.env.PRICE_SERVICE_URL || 'http://localhost:3001',
    BLOCKCHAIN: process.env.BLOCKCHAIN_SERVICE_URL || 'http://localhost:3000'
};

console.log('Service configuration:');
Object.entries(SERVICES).forEach(([name, url]) => {
    console.log(`  ${name}: ${url}`);
});

// ==================== UTILITY FUNCTIONS ====================

async function forwardRequest(serviceUrl, path, options = {}) {
    try {
        const url = `${serviceUrl}${path}`;
        console.log(` Forwarding to: ${url}`);

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

        console.log(` Response from ${serviceUrl}: ${response.status}`);

        return {
            status: response.status,
            ok: response.ok,
            data
        };
    } catch (error) {
        console.error(` Error forwarding to ${serviceUrl}${path}:`, error.message);
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
    console.log(' Registration request:', req.body.phone);
    const result = await forwardRequest(SERVICES.AUTH, '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    if (result.ok) {
        console.log(' Registration successful');
    } else {
        console.log(' Registration failed:', result.data);
    }

    res.status(result.status).json(result.data);
});

// Login
app.post('/api/auth/login', async (req, res) => {
    console.log(' Login request:', req.body.phone);
    const result = await forwardRequest(SERVICES.AUTH, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    // If login successful, set session
    if (result.ok && result.data.user) {
        req.session.isAuth = true;
        req.session.user = result.data.user;
        console.log(' Login successful, session created for:', req.session.user.fullName);
    } else {
        console.log(' Login failed:', result.data);
    }

    res.status(result.status).json(result.data);
});

// Get Profile
app.get('/api/auth/profile', async (req, res) => {
    console.log(' Profile request, session auth:', req.session.isAuth);

    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({ user: req.session.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    console.log(' Logout request');
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
    console.log(' ML Analysis request');

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    console.log('  File:', req.file.originalname, `(${req.file.size} bytes)`);

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
        console.log('  Result:', data);

        res.status(response.status).json(data);

    } catch (error) {
        console.error(' ML service error:', error.message);
        res.status(500).json({
            success: false,
            message: 'ML service unavailable'
        });
    }
});

// ==================== PRICE API ROUTES ====================

// Get Price
app.post('/api/price', async (req, res) => {
    console.log(' Price request:', req.body);
    const result = await forwardRequest(SERVICES.PRICE, '/price', {
        method: 'POST',
        body: JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
});

// ==================== BLOCKCHAIN ROUTES ====================

// Create Transaction
app.post('/api/blockchain/transactions', async (req, res) => {
    console.log('  Blockchain transaction request');

    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Add user info to transaction
    const transactionData = {
        ...req.body,
        farmerId: req.session.user.farmerId,
        farmerName: req.session.user.fullName
    };

    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/transactions', {
        method: 'POST',
        body: JSON.stringify(transactionData)
    });

    res.status(result.status).json(result.data);
});

// Get Ledger
app.get('/api/blockchain/ledger', async (req, res) => {
    console.log(' Ledger request');
    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/ledger', {
        method: 'GET'
    });

    res.status(result.status).json(result.data);
});

// Verify Ledger
app.get('/api/blockchain/verify', async (req, res) => {
    console.log(' Verify ledger request');
    const result = await forwardRequest(SERVICES.BLOCKCHAIN, '/api/ledger/verify', {
        method: 'GET'
    });

    res.status(result.status).json(result.data);
});

// Get Transaction History (for logged-in user)
app.get('/api/blockchain/history', async (req, res) => {
    console.log('[GET] Transaction history request');

    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const farmerId = req.session.user.farmerId;
    console.log('  Farmer ID:', farmerId);

    const result = await forwardRequest(
        SERVICES.BLOCKCHAIN,
        `/api/history?farmerId=${farmerId}`,
        { method: 'GET' }
    );

    if (result.ok && result.data) {
        const transactions = result.data.transactions || result.data;
        res.status(result.status).json({ transactions });
    } else {
        res.status(result.status).json(result.data);
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
    console.log('  Health check');

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
    console.log(' Serving home page');
    res.sendFile(path.join(signinPath, 'Index.html'));
});

app.get('/dashboard', (req, res) => {
    console.log(' Dashboard request, authenticated:', req.session.isAuth);

    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(dashboardPath, 'AIIndex.html'));
});

app.get('/profile', (req, res) => {
    console.log(' Profile page request, authenticated:', req.session.isAuth);

    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(dashboardPath, 'profile.html'));
});

app.get('/history', (req, res) => {
    console.log(' History page request, authenticated:', req.session.isAuth);

    if (!req.session.isAuth) {
        return res.redirect('/');
    }
    res.sendFile(path.join(dashboardPath, 'history.html'));
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
    console.log('  404 Not Found:', req.url);
    res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error(' Gateway error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==================== START SERVER ====================

const PORT = process.env.GATEWAY_PORT || 4000;

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(' API GATEWAY RUNNING');
    console.log('='.repeat(60));
    console.log(`Gateway URL: http://localhost:${PORT}`);
    console.log('\nForwarding to services:');
    console.log(`  Auth:       ${SERVICES.AUTH}`);
    console.log(`  ML:         ${SERVICES.ML}`);
    console.log(`  Price:      ${SERVICES.PRICE}`);
    console.log(`  Blockchain: ${SERVICES.BLOCKCHAIN}`);
    console.log('='.repeat(60));
    console.log('\n Debug logging enabled');
    console.log('All requests will be logged to console\n');
});

export default app;