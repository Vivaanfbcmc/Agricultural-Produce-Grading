-- ============================================
-- Unified PostgreSQL Schema
-- For Agricultural Produce Grading System
-- Combines Farmer Authentication + Blockchain
-- ============================================

-- ============================================
-- FARMERS TABLE (Authentication)
-- ============================================
CREATE TABLE IF NOT EXISTS farmers (
    id SERIAL PRIMARY KEY,
    fname VARCHAR(100) NOT NULL,
    lname VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    hashedPassword VARCHAR(255) NOT NULL,
    state VARCHAR(100),
    district VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Index for phone lookup (frequent in auth)
CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone);
CREATE INDEX IF NOT EXISTS idx_farmers_email ON farmers(email);

-- ============================================
-- LEDGER TABLE (Blockchain - Immutable)
-- ============================================
CREATE TABLE IF NOT EXISTS ledger (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    data JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    previous_hash VARCHAR(64),
    hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ledger queries
CREATE INDEX IF NOT EXISTS idx_ledger_farmer_id ON ledger(farmer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON ledger(hash);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(created_at);

-- ============================================
-- TRANSACTIONS TABLE (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    action VARCHAR(255) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_farmer_id ON transactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);

-- ============================================
-- VERIFICATION LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS verification_log (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER REFERENCES ledger(id),
    verified_at TIMESTAMP DEFAULT NOW(),
    is_valid BOOLEAN NOT NULL,
    verification_details JSONB
);

-- Index for verification queries
CREATE INDEX IF NOT EXISTS idx_verification_log_ledger_id ON verification_log(ledger_id);
CREATE INDEX IF NOT EXISTS idx_verification_log_verified_at ON verification_log(verified_at);

-- ============================================
-- SAMPLE DATA (Optional)
-- ============================================
-- Uncomment to add sample farmers

-- INSERT INTO farmers (fname, lname, phone, email, hashedPassword, state, district)
-- VALUES ('Sample', 'Farmer', '9876543210', 'farmer@example.com', '$2b$10$...', 'Maharashtra', 'Pune');

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Ledger statistics view
CREATE OR REPLACE VIEW v_ledger_stats AS
SELECT 
    COUNT(*) as total_entries,
    COUNT(DISTINCT farmer_id) as total_farmers,
    MAX(created_at) as last_entry,
    MIN(created_at) as first_entry
FROM ledger;

-- Farmer activity view
CREATE OR REPLACE VIEW v_farmer_activity AS
SELECT 
    f.id,
    f.fname,
    f.lname,
    f.phone,
    COUNT(l.id) as total_transactions,
    MAX(l.created_at) as last_transaction
FROM farmers f
LEFT JOIN ledger l ON f.id = l.farmer_id
GROUP BY f.id, f.fname, f.lname, f.phone;

-- ============================================
-- END OF SCHEMA
-- ============================================
