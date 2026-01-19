const express = require('express');
const router = express.Router();
const LedgerService = require('../services/ledger.service');
const { authenticateAndLinkBlockchain } = require('../middleware/blockchainAuth');

/**
 * Blockchain Ledger Routes
 * All routes require farmer authentication
 */

/**
 * POST /api/blockchain/transactions
 * Create a new transaction in the immutable ledger
 * Requires: authenticated farmer
 */
router.post('/transactions', authenticateAndLinkBlockchain, async (req, res) => {
    try {
        const { produceType, quantity, grade, pricePerUnit, totalPrice, buyerId } = req.body;

        // Validate input
        if (!produceType || !quantity || !grade) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: produceType, quantity, grade'
            });
        }

        const transactionData = {
            farmerId: req.farmerInfo.blockchainId,
            farmerName: req.farmerInfo.name,
            farmerEmail: req.farmerInfo.email,
            produce: {
                type: produceType,
                quantity,
                grade,
                pricePerUnit: pricePerUnit || 0,
                totalPrice: totalPrice || 0
            },
            buyerId: buyerId || null,
            action: 'PRODUCE_ENTRY',
            status: 'RECORDED'
        };

        const ledgerEntry = await LedgerService.createLedgerEntry(
            transactionData,
            req.farmerInfo.blockchainId
        );

        res.status(201).json({
            success: true,
            message: 'Transaction recorded in blockchain ledger',
            transaction: ledgerEntry.data,
            blockchainHash: ledgerEntry.data.hash
        });

    } catch (err) {
        console.error('Transaction creation error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to create transaction',
            error: err.message
        });
    }
});

/**
 * GET /api/blockchain/ledger
 * Get all ledger entries for authenticated farmer
 * Requires: authenticated farmer
 */
router.get('/ledger', authenticateAndLinkBlockchain, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;

        const entries = await LedgerService.getLedgerEntries(
            limit,
            offset,
            req.farmerInfo.blockchainId
        );

        res.json({
            success: true,
            count: entries.length,
            entries
        });

    } catch (err) {
        console.error('Ledger fetch error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ledger',
            error: err.message
        });
    }
});

/**
 * GET /api/blockchain/verify
 * Verify blockchain ledger integrity
 * Returns verification status of entire chain
 */
router.get('/verify', async (req, res) => {
    try {
        const verification = await LedgerService.verifyLedger();
        
        res.json({
            success: verification.valid,
            verification
        });

    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: err.message
        });
    }
});

/**
 * GET /api/blockchain/stats
 * Get blockchain statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await LedgerService.getLedgerStats();
        
        res.json({
            success: true,
            stats
        });

    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stats',
            error: err.message
        });
    }
});

/**
 * GET /api/blockchain/ledger/:id
 * Get specific ledger entry
 */
router.get('/ledger/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await LedgerService.getLedgerEntries(1, 0);
        
        const entry = result.find(e => e.id === parseInt(id));
        
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Ledger entry not found'
            });
        }

        res.json({
            success: true,
            entry
        });

    } catch (err) {
        console.error('Ledger entry fetch error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ledger entry',
            error: err.message
        });
    }
});

module.exports = router;
