# ✅ Migration Checklist

Complete these steps to migrate from separate BackEnd & BlockchainLedger to unified system.

---

## Phase 1: Preparation

- [ ] Backup existing MySQL database
  ```bash
  mysqldump -u root -p agriculture_db > backup_mysql.sql
  ```

- [ ] Backup existing PostgreSQL database (if any)
  ```bash
  pg_dump -U postgres agriculture_ledger > backup_postgres.sql
  ```

- [ ] Note current configuration
  - MySQL host, user, password, database
  - PostgreSQL host, user, password, database
  - Any custom environment variables

- [ ] Identify running processes
  ```bash
  lsof -i :5000     # Backend
  lsof -i :3000     # Old Blockchain
  ```

---

## Phase 2: Setup

- [ ] Navigate to BackEnd
  ```bash
  cd BackEnd
  ```

- [ ] Install unified dependencies
  ```bash
  npm install
  ```

- [ ] Copy environment template
  ```bash
  cp .env.example .env
  ```

- [ ] Edit `.env` with your credentials
  ```bash
  # Open .env and update:
  # MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
  # POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
  # SESSION_SECRET
  ```

---

## Phase 3: Database Setup

- [ ] Verify PostgreSQL is running
  ```bash
  psql --version
  psql -U postgres -c "SELECT 1;"
  ```

- [ ] Create PostgreSQL database
  ```bash
  psql -U postgres -c "CREATE DATABASE agriculture_ledger;"
  ```

- [ ] Run schema migration
  ```bash
  psql -U postgres -d agriculture_ledger -f ../BlockchainLedger/database/001_integrated_schema.sql
  ```

- [ ] Verify tables created
  ```bash
  psql -U postgres -d agriculture_ledger -c "\dt"
  ```

- [ ] Verify MySQL database still exists
  ```bash
  mysql -u root -p -e "USE agriculture_db; SHOW TABLES;"
  ```

---

## Phase 4: Testing

- [ ] Start development server
  ```bash
  npm run dev
  ```

- [ ] Check health endpoint
  ```bash
  curl http://localhost:5000/health
  ```

- [ ] Verify both databases connected
  - Look for: "✅ MySQL connected"
  - Look for: "✅ PostgreSQL connected"

- [ ] Test registration
  ```bash
  curl -X POST http://localhost:5000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Farmer",
      "email": "test@farm.com",
      "password": "test123"
    }'
  ```

- [ ] Test login
  ```bash
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -c cookies.txt \
    -d '{
      "email": "test@farm.com",
      "password": "test123"
    }'
  ```

- [ ] Test blockchain transaction
  ```bash
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
  ```

- [ ] Test ledger retrieval
  ```bash
  curl http://localhost:5000/api/blockchain/ledger \
    -b cookies.txt
  ```

- [ ] Test verification
  ```bash
  curl http://localhost:5000/api/blockchain/verify
  ```

---

## Phase 5: Migration of Existing Data (Optional)

If you want to migrate existing blockchain data:

- [ ] Export old blockchain data
  ```bash
  # Export from old PostgreSQL
  pg_dump -U postgres agriculture_ledger > old_data.sql
  ```

- [ ] Map old farmer IDs to new MySQL IDs
  ```sql
  -- In new PostgreSQL database
  INSERT INTO farmers (farmer_id, name, email)
  SELECT id, name, email FROM old_farmers_table;
  ```

- [ ] Rehash old transactions
  ```javascript
  // Use ledger.service.js to rehash and verify
  const data = require('./old_data.json');
  data.forEach(async (tx) => {
    await LedgerService.createLedgerEntry(tx.data, tx.farmer_id);
  });
  ```

- [ ] Verify chain integrity
  ```bash
  curl http://localhost:5000/api/blockchain/verify
  ```

---

## Phase 6: Deployment

- [ ] Test production build
  ```bash
  NODE_ENV=production npm start
  ```

- [ ] Update firewall rules (if needed)
  ```bash
  sudo ufw allow 5000
  ```

- [ ] Setup PM2 (optional)
  ```bash
  npm install -g pm2
  pm2 start BackEnd/server.js --name "agriculture"
  pm2 startup
  pm2 save
  ```

- [ ] Configure reverse proxy (nginx/Apache)
  ```nginx
  location / {
    proxy_pass http://localhost:5000;
  }
  ```

- [ ] Setup SSL certificate
  ```bash
  sudo certbot certonly --standalone -d yourdomain.com
  ```

- [ ] Update frontend API endpoints to new port (if needed)
  - All requests now go to http://localhost:5000

---

## Phase 7: Cleanup

- [ ] Stop old processes
  ```bash
  # Stop old BackEnd (port 5000)
  kill <PID>
  
  # Stop old BlockchainLedger (port 3000)
  kill <PID>
  ```

- [ ] Remove old node_modules
  ```bash
  rm -rf BlockchainLedger/backend/node_modules
  ```

- [ ] Clean up old .env files (optional)
  ```bash
  # Keep backups of old configs
  cp BlockchainLedger/backend/.env BlockchainLedger/backend/.env.backup
  ```

- [ ] Archive old code (optional)
  ```bash
  tar -czf old_blockchain_ledger.tar.gz BlockchainLedger/
  ```

---

## Phase 8: Verification

- [ ] Monitor logs
  ```bash
  npm run dev
  # or
  pm2 logs agriculture
  ```

- [ ] Test all endpoints
  - [ ] POST /api/auth/register
  - [ ] POST /api/auth/login
  - [ ] GET /api/auth/profile
  - [ ] POST /api/blockchain/transactions
  - [ ] GET /api/blockchain/ledger
  - [ ] GET /api/blockchain/verify
  - [ ] GET /api/blockchain/stats
  - [ ] GET /health

- [ ] Check database consistency
  ```bash
  # MySQL
  mysql -u root -p agriculture_db -e "SELECT COUNT(*) FROM farmers;"
  
  # PostgreSQL
  psql -U postgres agriculture_ledger -c "SELECT COUNT(*) FROM ledger;"
  ```

- [ ] Verify blockchain integrity
  ```bash
  curl http://localhost:5000/api/blockchain/verify
  ```

- [ ] Monitor resource usage
  ```bash
  # Check memory, CPU
  top
  # or
  pm2 monit
  ```

---

## Phase 9: Documentation

- [ ] Update team documentation
  - [ ] Point to INTEGRATION_GUIDE.md
  - [ ] Point to API_REFERENCE.md
  - [ ] Update deployment procedures

- [ ] Update frontend README
  - [ ] Change API endpoint to http://localhost:5000
  - [ ] Update deployment URLs

- [ ] Add to version control
  ```bash
  git add -A
  git commit -m "chore: unified backend - single npm package"
  git push
  ```

---

## Phase 10: Rollback Plan (If Needed)

If something goes wrong:

- [ ] Stop current server
  ```bash
  npm stop
  # or
  pm2 stop agriculture
  ```

- [ ] Restore MySQL from backup
  ```bash
  mysql -u root -p agriculture_db < backup_mysql.sql
  ```

- [ ] Restore PostgreSQL from backup
  ```bash
  psql -U postgres agriculture_ledger < backup_postgres.sql
  ```

- [ ] Restart old processes (if kept)
  ```bash
  cd BackEnd && npm start
  # and
  cd BlockchainLedger/backend && npm start
  ```

- [ ] Revert code changes
  ```bash
  git revert <commit_hash>
  ```

---

## Troubleshooting During Migration

### Issue: "npm install" fails

**Solution:**
```bash
# Clear cache
npm cache clean --force

# Remove node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: "Can't connect to MySQL"

**Check:**
1. MySQL is running: `sudo service mysql status`
2. Credentials in .env are correct
3. Database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Issue: "Can't connect to PostgreSQL"

**Check:**
1. PostgreSQL is running: `sudo service postgresql status`
2. Credentials in .env are correct
3. Database exists: `psql -l`

### Issue: "Port 5000 already in use"

**Solution:**
```bash
# Find process
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port in .env
PORT=5001
```

### Issue: "Hash verification fails"

**This means data was tampered with!**
- Restore from backup
- Check database integrity
- Review access logs

---

## Sign-Off Checklist

- [ ] All tests passed ✅
- [ ] Databases working ✅
- [ ] Blockchain verified ✅
- [ ] All endpoints responding ✅
- [ ] Performance acceptable ✅
- [ ] Logs clean (no errors) ✅
- [ ] Team notified ✅
- [ ] Documentation updated ✅

---

## Post-Migration

- [ ] Monitor for 24-48 hours
- [ ] Check database growth is normal
- [ ] Verify no memory leaks
- [ ] Confirm blockchain integrity daily
- [ ] Setup automated backups
- [ ] Review security logs

---

## Contact & Support

If issues arise:
1. Check INTEGRATION_GUIDE.md
2. Check DEPLOYMENT_GUIDE.md
3. Check logs: `npm run dev` or `pm2 logs`
4. Rollback to previous version if needed

---

**Migration Date:** _____________  
**Migrated By:** _____________  
**Verified By:** _____________  

---

**Status:** Ready for Production ✅
