# 📚 API Reference

## Base URL
```
http://localhost:5000
```

## Authentication Endpoints

### 1. Register Farmer

**Endpoint:** `POST /api/auth/register`

**Request:**
```json
{
  "name": "John Farmer",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Farmer registered successfully",
  "user": {
    "id": 1,
    "name": "John Farmer",
    "email": "john@example.com"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "Email already exists"
}
```

---

### 2. Login Farmer

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "name": "John Farmer",
    "email": "john@example.com"
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 3. Get Profile

**Endpoint:** `GET /api/auth/profile`

**Headers:**
```
Cookie: connect.sid=<session_id>
```

**Response (200):**
```json
{
  "id": 1,
  "name": "John Farmer",
  "email": "john@example.com"
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Not authenticated"
}
```

---

## Blockchain Ledger Endpoints

> ⚠️ **All blockchain endpoints require authentication**

### 1. Create Transaction

**Endpoint:** `POST /api/blockchain/transactions`

**Headers:**
```
Cookie: connect.sid=<session_id>
Content-Type: application/json
```

**Request:**
```json
{
  "produceType": "tomato",
  "quantity": 500,
  "grade": "A",
  "pricePerUnit": 40,
  "totalPrice": 20000,
  "buyerId": "buyer_123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Transaction recorded in blockchain ledger",
  "transaction": {
    "id": 1,
    "farmer_id": 1,
    "data": {
      "farmerId": 1,
      "farmerName": "John Farmer",
      "produce": {
        "type": "tomato",
        "quantity": 500,
        "grade": "A",
        "pricePerUnit": 40,
        "totalPrice": 20000
      },
      "action": "PRODUCE_ENTRY",
      "status": "RECORDED"
    },
    "timestamp": "2026-01-18T10:30:00Z",
    "previous_hash": "abc123...",
    "hash": "def456...",
    "created_at": "2026-01-18T10:30:00Z"
  },
  "blockchainHash": "def456..."
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "Missing required fields: produceType, quantity, grade"
}
```

---

### 2. Get Farmer's Ledger

**Endpoint:** `GET /api/blockchain/ledger`

**Query Parameters:**
- `limit` (optional): Max entries to return (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Headers:**
```
Cookie: connect.sid=<session_id>
```

**Example:**
```
GET /api/blockchain/ledger?limit=10&offset=0
```

**Response (200):**
```json
{
  "success": true,
  "count": 10,
  "entries": [
    {
      "id": 10,
      "farmer_id": 1,
      "data": {...},
      "timestamp": "2026-01-18T10:25:00Z",
      "hash": "xyz789...",
      "created_at": "2026-01-18T10:25:00Z"
    },
    // ... more entries
  ]
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Not authenticated"
}
```

---

### 3. Verify Blockchain Integrity

**Endpoint:** `GET /api/blockchain/verify`

**Headers:**
```
Content-Type: application/json
```

**Response (200) - Valid:**
```json
{
  "success": true,
  "verification": {
    "valid": true,
    "message": "All entries verified successfully",
    "total_entries": 42
  }
}
```

**Response (200) - Invalid:**
```json
{
  "success": false,
  "verification": {
    "valid": false,
    "message": "Hash mismatch at entry #15",
    "entry_id": 15
  }
}
```

---

### 4. Get Blockchain Statistics

**Endpoint:** `GET /api/blockchain/stats`

**Headers:**
```
Content-Type: application/json
```

**Response (200):**
```json
{
  "success": true,
  "stats": {
    "total_entries": 42,
    "total_farmers": 5,
    "last_entry": "2026-01-18T10:30:00Z"
  }
}
```

---

### 5. Get Specific Ledger Entry

**Endpoint:** `GET /api/blockchain/ledger/:id`

**Path Parameters:**
- `id`: Ledger entry ID

**Example:**
```
GET /api/blockchain/ledger/1
```

**Response (200):**
```json
{
  "success": true,
  "entry": {
    "id": 1,
    "farmer_id": 1,
    "data": {...},
    "timestamp": "2026-01-18T10:00:00Z",
    "hash": "abc123...",
    "created_at": "2026-01-18T10:00:00Z"
  }
}
```

**Error (404):**
```json
{
  "success": false,
  "message": "Ledger entry not found"
}
```

---

## Price API Endpoints

### 1. Get Prices

**Endpoint:** `GET /api/price`

**Query Parameters:**
- `crop` (optional): Filter by crop type
- `date` (optional): Filter by date

**Response (200):**
```json
{
  "success": true,
  "prices": [
    {
      "crop": "tomato",
      "price": 40,
      "market": "Delhi",
      "date": "2026-01-18"
    }
  ]
}
```

---

## Health Check

**Endpoint:** `GET /health`

**Response (200):**
```json
{
  "status": "OK",
  "message": "Agricultural Produce Grading System - Unified Backend Running",
  "timestamp": "2026-01-18T10:30:00Z",
  "version": "2.0.0"
}
```

---

## Root Endpoint

**Endpoint:** `GET /`

**Response (200):**
```json
{
  "message": "Agricultural Produce Grading System",
  "version": "2.0.0",
  "description": "Integrated Farmer Authentication + Blockchain Ledger",
  "endpoints": {
    "health": "/health",
    "auth": {
      "register": "POST /api/auth/register",
      "login": "POST /api/auth/login",
      "profile": "GET /api/auth/profile"
    },
    "blockchain": {
      "createTransaction": "POST /api/blockchain/transactions",
      "getLedger": "GET /api/blockchain/ledger",
      "verify": "GET /api/blockchain/verify",
      "stats": "GET /api/blockchain/stats"
    },
    "prices": "GET /api/price"
  }
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 404 | Not Found - Resource not found |
| 500 | Server Error - Internal server error |

---

## Common Workflows

### Workflow 1: Register → Login → Create Transaction

```bash
# 1. Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Farmer John",
    "email": "john@farm.com",
    "password": "secure123"
  }' \
  -c cookies.txt

# 2. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "email": "john@farm.com",
    "password": "secure123"
  }'

# 3. Create Transaction (Blockchain)
curl -X POST http://localhost:5000/api/blockchain/transactions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "produceType": "tomato",
    "quantity": 500,
    "grade": "A",
    "pricePerUnit": 40,
    "totalPrice": 20000
  }'

# 4. View Ledger
curl http://localhost:5000/api/blockchain/ledger \
  -b cookies.txt

# 5. Verify Blockchain
curl http://localhost:5000/api/blockchain/verify
```

### Workflow 2: View All Farmer Transactions

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "john@farm.com",
    "password": "secure123"
  }'

# Get paginated ledger
curl "http://localhost:5000/api/blockchain/ledger?limit=20&offset=0" \
  -b cookies.txt
```

---

## Rate Limiting

Currently no rate limiting implemented. Add if needed:

```bash
npm install express-rate-limit
```

---

## CORS

Enabled for all origins. Configure in production:

```javascript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true
}));
```

---

**Last Updated:** January 2026  
**Version:** 2.0.0
