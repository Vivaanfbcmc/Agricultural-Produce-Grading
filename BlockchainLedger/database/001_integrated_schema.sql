-- ========================================
-- PostgreSQL Blockchain Ledger Schema
-- ========================================

-- Farmers table (linked to MySQL)
CREATE TABLE IF NOT EXISTS farmers (
    id SERIAL PRIMARY KEY,
    farmer_id INT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Immutable Ledger (Blockchain)
CREATE TABLE IF NOT EXISTS ledger (
    id SERIAL PRIMARY KEY,
    farmer_id INT REFERENCES farmers(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chain_integrity CHECK (hash IS NOT NULL)
);

-- Transactions Table (for tracking all operations)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    farmer_id INT REFERENCES farmers(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    status VARCHAR(50) DEFAULT 'RECORDED',
    hash VARCHAR(64) UNIQUE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verification Log (for audit trail)
CREATE TABLE IF NOT EXISTS verification_log (
    id SERIAL PRIMARY KEY,
    ledger_id INT REFERENCES ledger(id) ON DELETE CASCADE,
    is_valid BOOLEAN NOT NULL,
    verification_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_by VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ledger_farmer_id ON ledger(farmer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON ledger(hash);
CREATE INDEX IF NOT EXISTS idx_transactions_farmer_id ON transactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_farmers_farmer_id ON farmers(farmer_id);
