# ⚡ Quick Commands Reference

## Installation & Setup

```bash
# Navigate to backend
cd BackEnd

# Install dependencies (once)
npm install

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env  # or use your editor
```

---

## Running the Server

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start

# Verify it's running
curl http://localhost:5000/health
```

---

## Testing with curl

### Authentication

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "name": "Test Farmer",
    "email": "test@farm.com",
    "password": "test123"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -c cookies.txt \
  -d '{
    "email": "test@farm.com",
    "password": "test123"
  }'

# Get profile
curl http://localhost:5000/api/auth/profile \
  -b cookies.txt
```

### Blockchain

```bash
# Create transaction
curl -X POST http://localhost:5000/api/blockchain/transactions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "produceType": "tomato",
    "quantity": 100,
    "grade": "A",
    "pricePerUnit": 50,
    "totalPrice": 5000
  }'

# Get ledger
curl http://localhost:5000/api/blockchain/ledger?limit=10 \
  -b cookies.txt

# Verify blockchain
curl http://localhost:5000/api/blockchain/verify

# Get statistics
curl http://localhost:5000/api/blockchain/stats
```

### System

```bash
# Health check
curl http://localhost:5000/health

# API info
curl http://localhost:5000/
```

---

## Database Setup

### PostgreSQL

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE agriculture_ledger;

# Connect to database
\c agriculture_ledger

# Run schema
\i /path/to/BlockchainLedger/database/001_integrated_schema.sql

# List tables
\dt

# Check farmers
SELECT * FROM farmers;

# Check ledger
SELECT * FROM ledger;

# Verify integrity
SELECT COUNT(*), COUNT(DISTINCT farmer_id) FROM ledger;

# Exit
\q
```

### MySQL

```bash
# Connect
mysql -u root -p

# Use database
USE agriculture_db;

# List tables
SHOW TABLES;

# Check farmers
SELECT * FROM farmers;

# Count records
SELECT COUNT(*) FROM farmers;

# Exit
EXIT;
```

---

## Environment Variables

```bash
# View current env
echo $PORT
echo $NODE_ENV

# Set for session
export PORT=5001
export NODE_ENV=development

# Check .env
cat .env | grep MYSQL
cat .env | grep POSTGRES
```

---

## Process Management

### Manual

```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>

# List all Node processes
ps aux | grep node
```

### PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start BackEnd/server.js --name "agriculture"

# List processes
pm2 list

# Monitor
pm2 monit

# View logs
pm2 logs agriculture

# Stop process
pm2 stop agriculture

# Restart process
pm2 restart agriculture

# Delete process
pm2 delete agriculture

# Start on boot
pm2 startup
pm2 save
```

---

## Log Viewing

```bash
# Using npm (development)
npm run dev

# Using PM2
pm2 logs agriculture

# Using tail (production)
tail -f /var/log/agricultural-backend.log

# Filter logs
grep "error" /var/log/agricultural-backend.log
grep "blockchain" /var/log/agricultural-backend.log

# Search by timestamp
grep "2026-01-18" /var/log/agricultural-backend.log
```

---

## Database Backups

### Backup

```bash
# MySQL backup
mysqldump -u root -p agriculture_db > backup_mysql_$(date +%Y%m%d).sql

# PostgreSQL backup
pg_dump -U postgres agriculture_ledger > backup_postgres_$(date +%Y%m%d).sql

# Backup with compression
mysqldump -u root -p agriculture_db | gzip > backup_mysql_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
# MySQL restore
mysql -u root -p agriculture_db < backup_mysql.sql

# PostgreSQL restore
psql -U postgres agriculture_ledger < backup_postgres.sql

# Restore from compressed
gunzip -c backup_mysql.sql.gz | mysql -u root -p agriculture_db
```

---

## Development Tools

### Node Version

```bash
# Check Node version
node --version

# Check npm version
npm --version

# Update npm
npm install -g npm@latest
```

### Dependencies

```bash
# List dependencies
npm list

# Check for outdated packages
npm outdated

# Update packages
npm update

# Install specific version
npm install express@5.2.1

# Remove dependency
npm uninstall cors
```

### Debugging

```bash
# Debug in node
node --inspect server.js

# Debug in VS Code
# Add to .vscode/launch.json

# Check port binding
netstat -tulpn | grep 5000

# Monitor memory usage
watch -n 1 'ps -o %mem,cmd | grep node'
```

---

## Docker Commands

```bash
# Build image
docker build -t agriculture-backend .

# Run container
docker run -p 5000:5000 --env-file .env agriculture-backend

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop containers
docker-compose down

# List containers
docker ps

# Execute command in container
docker exec -it <container_id> npm run dev

# View image layers
docker history agriculture-backend
```

---

## Testing

### Manual Testing Script

```bash
#!/bin/bash

echo "1. Testing health check..."
curl http://localhost:5000/health

echo -e "\n2. Testing registration..."
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"name":"Test","email":"'$RANDOM'@test.com","password":"test123"}'

echo -e "\n3. Testing login..."
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"email":"test@test.com","password":"test123"}'

echo -e "\n4. Testing blockchain transaction..."
curl -X POST http://localhost:5000/api/blockchain/transactions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"produceType":"tomato","quantity":100,"grade":"A"}'

echo -e "\nDone!"
```

---

## Troubleshooting Commands

```bash
# Check if port is in use
sudo lsof -i -P -n | grep LISTEN

# Check MySQL status
sudo service mysql status
sudo systemctl start mysql

# Check PostgreSQL status
sudo service postgresql status
sudo systemctl start postgresql

# Test MySQL connection
mysql -u root -p -e "SELECT 1;"

# Test PostgreSQL connection
psql -U postgres -c "SELECT 1;"

# Clear npm cache
npm cache clean --force

# Clear node_modules
rm -rf node_modules package-lock.json && npm install

# Test port connectivity
nc -zv localhost 5000

# Show environment
printenv | grep NODE

# Check disk space
df -h

# Check memory
free -h

# View system logs (Linux)
journalctl -xe
```

---

## Performance Monitoring

```bash
# Real-time CPU and memory
top

# Process-specific stats
ps aux | grep node

# Network connections
netstat -an | grep 5000

# Disk I/O
iostat -x 1

# Memory detailed
free -m

# Which processes use most memory
ps aux --sort=-%mem | head

# Monitor with watch
watch -n 1 'ps aux | grep node'

# Using PM2
pm2 monit
```

---

## Security Checks

```bash
# Check if .env contains secrets
grep -i password .env

# Verify .env not in git
git status | grep .env

# Check file permissions
ls -la .env

# Set proper permissions
chmod 600 .env

# Check for exposed ports
sudo netstat -tuln | grep 5000

# Scan for open files
lsof -i

# Check SSL/TLS (if applicable)
openssl s_client -connect localhost:443
```

---

## Deployment Checklist

```bash
# Pre-deployment
git status                  # Check for uncommitted changes
npm test                    # Run tests (if available)
npm run lint                # Lint code (if configured)

# Build/Prepare
npm ci --only=production    # Clean install for production
NODE_ENV=production npm start

# Verify
curl http://localhost:5000/health
curl http://localhost:5000/

# Monitor
pm2 list
pm2 logs
```

---

## Documentation Navigation

```bash
# Read quick start
cat README_UNIFIED_BACKEND.md

# Full integration guide
cat INTEGRATION_GUIDE.md

# Deployment steps
cat DEPLOYMENT_GUIDE.md

# API documentation
cat API_REFERENCE.md

# Migration steps
cat MIGRATION_CHECKLIST.md

# Architecture diagrams
cat ARCHITECTURE_DIAGRAMS.md

# This file
cat QUICK_COMMANDS.md
```

---

## One-Line Commands

```bash
# Start development server
npm run dev

# Install and start
npm install && npm start

# Kill process on port 5000
kill -9 $(lsof -t -i :5000)

# Backup and start
mysqldump -u root -p agriculture_db > backup.sql && npm start

# Test all endpoints
for url in "" "health" "api/blockchain/verify" "api/blockchain/stats"; do
  echo "Testing: $url"
  curl -s http://localhost:5000/$url | jq .
done

# Monitor logs live
pm2 logs agriculture | grep -i error

# Count database records
mysql -u root -p -e "SELECT COUNT(*) FROM agriculture_db.farmers;"
psql -U postgres -d agriculture_ledger -c "SELECT COUNT(*) FROM ledger;"
```

---

## Emergency Procedures

```bash
# Server not responding
# 1. Check if it's running
ps aux | grep "node server.js"

# 2. Check logs
pm2 logs agriculture

# 3. Check port
lsof -i :5000

# 4. Kill and restart
pm2 restart agriculture

# 5. If still failing, check databases
mysql -u root -p -e "SELECT 1;"
psql -U postgres -c "SELECT 1;"

# Database corrupted
# 1. Restore from backup
mysql -u root -p agriculture_db < backup.sql

# 2. Verify integrity
psql -U postgres -d agriculture_ledger -c "SELECT * FROM ledger LIMIT 1;"

# Memory leak
# 1. Monitor memory
pm2 monit

# 2. Restart process
pm2 restart agriculture

# 3. Check logs for errors
pm2 logs agriculture
```

---

**Quick Links:**
- [README_UNIFIED_BACKEND.md](README_UNIFIED_BACKEND.md) - Quick start
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) - Complete setup
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Production deployment
- [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - System diagrams

---

**Version:** 2.0.0  
**Last Updated:** January 2026
