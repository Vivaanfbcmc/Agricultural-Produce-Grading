-- ============================================
-- LEDGER TABLE (Immutable History)
-- ============================================
CREATE TABLE ledger (
    id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ledger_timestamp ON ledger(timestamp);
CREATE INDEX idx_ledger_hash ON ledger(hash);

-- ============================================
-- NORMAL APPLICATION TABLES
-- ============================================

CREATE TABLE farmers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    farmer_id VARCHAR(50) REFERENCES farmers(id),
    produce_name VARCHAR(100) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    ai_grade VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * price) STORED,
    ledger_entry_id BIGINT REFERENCES ledger(id),
    status VARCHAR(20) DEFAULT 'verified',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_farmer ON transactions(farmer_id);
CREATE INDEX idx_transactions_date ON transactions(created_at);

-- ============================================
-- IMMUTABILITY TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION prevent_ledger_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries cannot be modified. This is an immutable record.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_ledger_update
BEFORE UPDATE ON ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_update();

CREATE OR REPLACE FUNCTION prevent_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries cannot be deleted. This is an immutable record.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_ledger_delete
BEFORE DELETE ON ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_delete();

-- ============================================
-- INSERT GENESIS BLOCK
-- ============================================

INSERT INTO ledger (data, previous_hash, hash)
VALUES (
    '{"type": "genesis", "message": "Ledger initialized"}'::jsonb,
    NULL,
    'genesis_00000000000000000000000000000000000000000000000000000000'
);

-- Verify genesis block
SELECT * FROM ledger;
