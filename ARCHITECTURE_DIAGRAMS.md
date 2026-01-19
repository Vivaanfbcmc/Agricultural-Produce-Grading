# 📐 Architecture Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                 │
│                  (HTML/CSS/JavaScript)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    All requests to
                       PORT 5000
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server                               │
│                    BackEnd/server.js                            │
│                    (Single Entry Point)                         │
└────────┬────────────────┬────────────────┬─────────────────────┘
         │                │                │
    /api/auth/*      /api/blockchain/*   /api/price/*
         │                │                │
         ↓                ↓                ↓
    ┌─────────┐   ┌──────────────┐   ┌─────────┐
    │  Auth   │   │ Blockchain   │   │ Prices  │
    │ Routes  │   │  Routes      │   │ Routes  │
    └────┬────┘   └──────┬───────┘   └─────────┘
         │                │
         │     authMiddleware
         │          │
         ↓          ↓
    ┌──────────────────────────┐
    │ blockchainAuth Middleware│
    │ (Auth + Link to BC)      │
    └────────────┬─────────────┘
                 │
         ┌───────┴────────┐
         │                │
         ↓                ↓
    ┌─────────────┐  ┌──────────────────┐
    │   MySQL     │  │   PostgreSQL     │
    │ agriculture │  │ agriculture_     │
    │    _db      │  │  ledger          │
    └─────────────┘  └──────────────────┘
    
    Farmers Table    Farmers Table
    ├─ id           ├─ id
    ├─ email        ├─ farmer_id(FK)
    ├─ name         ├─ name
    ├─ password     ├─ email
    └─ created_at   ├─ created_at
    
                    Ledger Table
                    ├─ id
                    ├─ farmer_id(FK)
                    ├─ data (JSONB)
                    ├─ hash (SHA-256)
                    ├─ previous_hash
                    └─ timestamp
```

---

## Request Flow: Authentication

```
Frontend (Login Form)
    │
    ├─ POST /api/auth/login
    │  {email, password}
    │
    ↓
Express Auth Route
    │
    ├─ Validate input
    │
    ↓
MySQL Query
    │
    ├─ SELECT * FROM farmers WHERE email = ?
    │
    ↓
Password Check (bcrypt)
    │
    ├─ bcrypt.compare(password, hash)
    │
    ↓
Create Session
    │
    ├─ req.session.isAuth = true
    ├─ req.session.user = {...}
    │
    ↓
Set Cookie (connect.sid)
    │
    ↓
Response
{
  "success": true,
  "user": {...}
}
    │
    └─ Browser stores cookie
```

---

## Request Flow: Blockchain Transaction

```
Frontend (Authenticated User)
    │
    ├─ POST /api/blockchain/transactions
    │  {produceType, quantity, grade, ...}
    │
    ├─ Headers: Cookie: connect.sid=xyz
    │
    ↓
Express Blockchain Route
    │
    ├─ POST /api/blockchain/transactions
    │
    ↓
[1] authenticateAndLinkBlockchain Middleware
    │
    ├─ Check req.session.isAuth
    ├─ Verify req.session.user exists
    │
    ↓
    ├─ Query PostgreSQL
    │  SELECT id FROM farmers WHERE farmer_id = ?
    │
    ↓
    ├─ If not found:
    │  INSERT INTO farmers (farmer_id, name, email)
    │
    ├─ If found: Use existing farmer_id
    │
    ↓
    ├─ Attach to request:
    │  req.farmerInfo = {
    │    mysqlId: ...,
    │    blockchainId: ...,
    │    name: ...,
    │    email: ...
    │  }
    │
    ├─ call next()
    │
    ↓
Route Handler
    │
    ├─ Validate input
    ├─ Build transaction data:
    │  {
    │    farmerId,
    │    produceType,
    │    quantity,
    │    grade,
    │    pricePerUnit,
    │    totalPrice,
    │    timestamp: now()
    │  }
    │
    ↓
LedgerService.createLedgerEntry()
    │
    ├─ Query PostgreSQL:
    │  SELECT * FROM ledger ORDER BY id DESC LIMIT 1
    │  → Get lastEntry (including last hash)
    │
    ↓
    ├─ Generate SHA-256 hash:
    │  hash = SHA256(
    │    JSON(data) +
    │    timestamp +
    │    previousHash
    │  )
    │
    ↓
    ├─ INSERT INTO ledger:
    │  (farmer_id, data, timestamp, hash, previous_hash)
    │
    ↓
    ├─ Return inserted ledger entry
    │
    ↓
Response
{
  "success": true,
  "transaction": {
    "id": 1,
    "hash": "abc123...",
    "timestamp": "...",
    "data": {...}
  }
}
    │
    └─ Browser receives with blockchain hash
```

---

## Blockchain Verification Flow

```
GET /api/blockchain/verify
    │
    ↓
Query PostgreSQL:
SELECT * FROM ledger ORDER BY id ASC
    │
    ├─ Get all ledger entries
    │  [entry1, entry2, entry3, ...]
    │
    ↓
For each entry (i=1 to length):
    │
    ├─ entry = entries[i]
    ├─ previousEntry = entries[i-1]
    │
    ├─ Compute hash:
    │  computedHash = SHA256(
    │    JSON(entry.data) +
    │    entry.timestamp +
    │    entry.previous_hash
    │  )
    │
    ├─ Check 1: Hash matches?
    │  if (computedHash !== entry.hash)
    │      return INVALID at entry #i
    │
    ├─ Check 2: Chain linked?
    │  if (entry.previous_hash !== previousEntry.hash)
    │      return CHAIN BROKEN at entry #i
    │
    ↓ (All checks pass)
    │
    └─ Return VALID
       {
         "valid": true,
         "total_entries": 42
       }
```

---

## Database Schema Relationships

```
┌──────────────────┐                ┌──────────────────┐
│   MySQL: farmers │                │ PostgreSQL:      │
│   (Auth)         │                │ farmers (BC)     │
│─────────────────│                │──────────────────│
│ id (PK)         │                │ id (PK)          │
│ email (UNIQUE)  │                │ farmer_id (FK)   │──┐
│ name            │                │ name             │  │
│ password_hash   │                │ email            │  │
│ created_at      │                │ created_at       │  │
│ updated_at      │                └──────────────────┘  │
└──────────────────┘                                      │
                                                          │
                                                          │
  ┌─────────────────────────────────────────────────────┘
  │
  │  One MySQL farmer = One PostgreSQL farmer
  │  (farmer_id links them)
  │
  ├──────────────┐
  │              ↓
  │      ┌──────────────────────────┐
  │      │ PostgreSQL: ledger (BC)  │
  │      │──────────────────────────│
  │      │ id (PK)                  │
  │      │ farmer_id (FK)──────┐    │
  │      │ data (JSONB)        │    │
  │      │ hash (SHA-256)      │    │
  │      │ previous_hash       │    │
  │      │ timestamp           │    │
  │      │ created_at          │    │
  │      └──────────────────────┘    │
  │                                  │
  │                                  │
  │      ┌──────────────────────────┐
  │      │ PostgreSQL: transactions │
  │      │──────────────────────────│
  │      │ id (PK)                  │
  │      │ farmer_id (FK)──────┐    │
  │      │ action              │    │
  │      │ details (JSONB)     │    │
  │      │ hash                │    │
  │      │ ip_address          │    │
  │      │ timestamp           │    │
  │      └──────────────────────────┘
```

---

## Session & Middleware Flow

```
Browser Request with Cookie
    │
    ├─ Headers:
    │  Cookie: connect.sid=abc123...
    │
    ↓
Express Session Middleware
    │
    ├─ Decode connect.sid
    ├─ Look up session store
    ├─ Load session object:
    │  {
    │    isAuth: true,
    │    user: {
    │      id: 1,
    │      name: "John",
    │      email: "john@farm.com"
    │    }
    │  }
    │
    ↓
authenticateAndLinkBlockchain
    │
    ├─ Check req.session.isAuth
    ├─ Verify req.session.user
    │
    ↓
Link to PostgreSQL
    │
    ├─ Query PostgreSQL farmers
    ├─ Link MySQL farmer to PostgreSQL farmer
    │
    ↓
recordBlockchainTransaction (optional)
    │
    ├─ Create transaction record
    ├─ Hash request details
    │
    ↓
Route Handler
    │
    ├─ Access req.farmerInfo
    │  (Contains both MySQL & PostgreSQL IDs)
    │
    ↓
Response
```

---

## Configuration & Environment

```
.env File (Not in git)
┌─────────────────────────────┐
│ PORT=5000                   │
│                             │
│ # Session                   │
│ SESSION_SECRET=...          │
│                             │
│ # MySQL (Auth)              │
│ MYSQL_HOST=localhost        │
│ MYSQL_USER=root             │
│ MYSQL_PASSWORD=...          │
│ MYSQL_DB=agriculture_db     │
│                             │
│ # PostgreSQL (Blockchain)   │
│ POSTGRES_HOST=localhost     │
│ POSTGRES_PORT=5432          │
│ POSTGRES_USER=postgres      │
│ POSTGRES_PASSWORD=...       │
│ POSTGRES_DB=agriculture_..  │
│                             │
│ # Node Environment          │
│ NODE_ENV=production         │
└─────────────────────────────┘
        │
        ├─ Loaded by dotenv
        ├─ process.env.MYSQL_HOST
        ├─ process.env.POSTGRES_HOST
        │  etc.
        │
        ↓
config/database.js
        │
        ├─ mysqlPool = createPool(
        │    host: process.env.MYSQL_HOST,
        │    ...
        │  )
        │
        ├─ postgresPool = new Pool(
        │    host: process.env.POSTGRES_HOST,
        │    ...
        │  )
        │
        └─ Export both pools
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────┐
│              Internet / HTTPS                        │
└─────────────┬──────────────────────────────┬─────────┘
              │                              │
              ↓                              ↓
        ┌──────────────┐            ┌──────────────┐
        │  nginx/      │            │  nginx/      │
        │  Apache      │            │  Apache      │
        │  (reverse    │            │  (reverse    │
        │  proxy)      │            │  proxy)      │
        └─────┬────────┘            └─────┬────────┘
              │                           │
        ┌─────┴───────────────────────────┘
        │
        ├─ Load Balancing
        │  (round-robin)
        │
        ↓
┌────────────────────┬────────────────────┬────────────────────┐
│  Node Process 1    │  Node Process 2    │  Node Process 3    │
│  Port 5001         │  Port 5002         │  Port 5003         │
│  (server.js)       │  (server.js)       │  (server.js)       │
└────────┬───────────┴────────┬───────────┴────────┬───────────┘
         │                    │                    │
         ├────────────────────┼────────────────────┤
         │                    │                    │
         ↓                    ↓                    ↓
    ┌──────────────────────────────────────────────────┐
    │     Shared MySQL Database                        │
    │     agriculture_db                               │
    │     (Session Store, Farmer Data)                 │
    └──────────────────────────────────────────────────┘
    
    ┌──────────────────────────────────────────────────┐
    │     Shared PostgreSQL Database                   │
    │     agriculture_ledger                           │
    │     (Blockchain Ledger - Read-Only for Queries)  │
    └──────────────────────────────────────────────────┘
    
    ┌──────────────────────────────────────────────────┐
    │     Backup Systems                               │
    │     - MySQL Backup (daily)                       │
    │     - PostgreSQL Backup (daily)                  │
    │     - Ledger Verification (hourly)               │
    └──────────────────────────────────────────────────┘
```

---

## Development vs Production

```
DEVELOPMENT
┌──────────────────────────────────────┐
│ npm run dev                          │
├──────────────────────────────────────┤
│ Nodemon (auto-restart)               │
│ Debug logs enabled                   │
│ CORS: * (all origins)                │
│ Session: In-memory                   │
│ Database: Local                      │
│ Performance: Not optimized           │
└──────────────────────────────────────┘


PRODUCTION
┌──────────────────────────────────────┐
│ npm start                            │
├──────────────────────────────────────┤
│ Single process                       │
│ Minimal logging                      │
│ CORS: Specific domains only          │
│ Session: Persistent store            │
│ Database: Cloud/Dedicated            │
│ Performance: Optimized               │
│ PM2/Docker: Process management       │
│ Monitoring: Active                   │
│ Backups: Automated                   │
└──────────────────────────────────────┘
```

---

## Error Handling Flow

```
Request Error
    │
    ├─ Validation Error
    │  ├─ Missing fields
    │  ├─ Invalid input
    │  └─ Return 400
    │
    ├─ Authentication Error
    │  ├─ No session
    │  ├─ Invalid credentials
    │  └─ Return 401
    │
    ├─ Not Found Error
    │  ├─ Resource doesn't exist
    │  └─ Return 404
    │
    ├─ Database Error
    │  ├─ Connection failed
    │  ├─ Query failed
    │  ├─ Log error
    │  └─ Return 500
    │
    └─ Server Error
       ├─ Uncaught exception
       ├─ Log error
       ├─ Send 500 response
       └─ Graceful shutdown
```

---

**These diagrams illustrate the complete unified backend system structure.**

For more details, see:
- INTEGRATION_GUIDE.md
- DEPLOYMENT_GUIDE.md
- API_REFERENCE.md
