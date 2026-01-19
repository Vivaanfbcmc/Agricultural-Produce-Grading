const { pool } = require('../config/database');

/**
 * Middleware to authenticate farmer and link to blockchain
 * Verifies session and creates blockchain transaction record
 */
const authenticateAndLinkBlockchain = async (req, res, next) => {
    try {
        // Check if farmer is authenticated
        if (!req.session.isAuth || !req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated. Please login first.' 
            });
        }

        const farmerId = req.session.user.farmerId;

        // Fetch or create farmer record in blockchain
        const farmerQuery = `
            SELECT id FROM farmers 
            WHERE id = $1 
            LIMIT 1
        `;
        
        let farmerRecord = await pool.query(farmerQuery, [farmerId]);

        if (farmerRecord.rows.length === 0) {
            // Create farmer record - should exist from auth, but handle gracefully
            const createFarmerQuery = `
                INSERT INTO farmers (id, fname, lname, email, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id
            `;
            const result = await pool.query(createFarmerQuery, [
                farmerId,
                req.session.user.fullName?.split(' ')[0] || 'Unknown',
                req.session.user.fullName?.split(' ')[1] || '',
                req.session.user.email || ''
            ]);
            req.blockchainFarmerId = result.rows[0].id;
        } else {
            req.blockchainFarmerId = farmerRecord.rows[0].id;
        }

        // Store farmer info for blockchain operations
        req.farmerInfo = {
            farmerId: farmerId,
            name: req.session.user.fullName,
            email: req.session.user.email
        };

        next();
    } catch (err) {
        console.error('Blockchain middleware error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
};

/**
 * Middleware to create blockchain transaction record
 * Tracks all operations on the immutable ledger
 */
const recordBlockchainTransaction = async (req, res, next) => {
    try {
        if (!req.farmerInfo) {
            return res.status(401).json({ 
                success: false, 
                message: 'Farmer info not found' 
            });
        }

        const transactionQuery = `
            INSERT INTO transactions (
                farmer_id, 
                action, 
                details, 
                ip_address, 
                timestamp
            )
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id
        `;

        const action = `${req.method} ${req.originalUrl}`;
        const details = JSON.stringify({
            body: req.body,
            query: req.query,
            farmer: req.farmerInfo.name
        });
        const ipAddress = req.ip || req.connection.remoteAddress;

        const result = await pool.query(transactionQuery, [
            req.farmerInfo.farmerId,
            action,
            details,
            ipAddress
        ]);

        req.blockchainTx = {
            id: result.rows[0].id
        };

        next();
    } catch (err) {
        console.error('Transaction recording error:', err);
        // Don't fail the request, just log
        next();
    }
};

module.exports = {
    authenticateAndLinkBlockchain,
    recordBlockchainTransaction
};
