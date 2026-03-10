// ═══════════════════════════════════════════════════════
//  VEGEGRADE — Transaction History Logic
//
//  All calls go through the GATEWAY (relative URLs):
//  GET /api/transactions           → fetch all
//  GET /api/transactions?farmerId  → filter by farmer
//
//  ❌ /api/blockchain/history      → does NOT exist
//  ❌ /api/blockchain/transactions → does NOT exist
//  ✅ /api/transactions            → correct gateway route
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }) + ' ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2
  }).format(amount || 0);
}

// Grade badge — supports both old HTML (grade-A class) and new gov HTML (hist-pill)
function getGradeBadge(grade) {
  const g = (grade || 'N/A').toUpperCase();

  // New government HTML uses hist-pill classes
  const pillMap = { 'A': 'pill-grade-a', 'B': 'pill-grade-b', 'C': 'pill-grade-c', 'ROTTEN': 'pill-grade-r' };
  if (document.querySelector('.hist-pill') !== null || document.getElementById('tableWrap')) {
    return `<span class="hist-pill ${pillMap[g] || 'pill-grade-b'}">${g}</span>`;
  }

  // Old HTML uses grade-X classes
  return `<span class="grade-badge grade-${g}">${g}</span>`;
}

function getStatusBadge(status) {
  const s = (status || 'completed').toLowerCase();

  // New government HTML
  if (document.getElementById('tableWrap')) {
    const cls = ['verified', 'pending', 'completed'].includes(s) ? `pill-status-${s}` : 'pill-status-completed';
    return `<span class="hist-pill ${cls}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
  }

  // Old HTML
  return `<span class="grade-badge grade-${s === 'verified' ? 'A' : 'B'}">${s}</span>`;
}

// ═══════════════════════════════════════════════════════
//  FETCH FROM BACKEND VIA GATEWAY
//  GET /api/transactions
//  Returns: { success, count, transactions: [...] }
// ═══════════════════════════════════════════════════════
async function fetchHistoryFromBackend() {
  const farmerId = localStorage.getItem('farmerId');

  const url = farmerId
    ? `/api/transactions?farmerId=${encodeURIComponent(farmerId)}`
    : `/api/transactions`;

  console.log('[History] Fetching →', url);

  const response = await fetch(url, {
    method:  'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  // Safe JSON parse — avoids "Unexpected token <" crash on HTML error pages
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON (status ${response.status}). Is the gateway running?`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error('Not authenticated. Please log in.');
    throw new Error(data.error || data.message || `Server error: ${response.status}`);
  }

  return data.transactions || data || [];
}

// ═══════════════════════════════════════════════════════
//  LOCAL CACHE
// ═══════════════════════════════════════════════════════
function getLocalHistory() {
  return JSON.parse(localStorage.getItem('vegegrade_history') || '[]');
}

// ═══════════════════════════════════════════════════════
//  RENDER — works for both old HTML and new government HTML
// ═══════════════════════════════════════════════════════
function renderHistory(list) {
  const spinner  = document.getElementById('loadingSpinner');
  const empty    = document.getElementById('emptyState');

  // Detect which HTML we're in
  const isNewHTML   = !!document.getElementById('tableWrap');
  const tableWrap   = document.getElementById('tableWrap');
  const historyTable = document.getElementById('historyTable'); // old HTML
  const body        = document.getElementById('historyBody');
  const statsRow    = document.getElementById('statsRow');      // new HTML only

  if (spinner) spinner.style.display = 'none';
  if (body)    body.innerHTML = '';

  if (!list || !list.length) {
    if (isNewHTML)    { tableWrap.style.display = 'none'; if (statsRow) statsRow.style.display = 'none'; }
    else if (historyTable) historyTable.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (isNewHTML)    { tableWrap.style.display = 'block'; if (statsRow) statsRow.style.display = 'flex'; }
  else if (historyTable) historyTable.style.display = 'table';

  let totalRevenue  = 0;
  let totalQuantity = 0;
  let gradeACount   = 0;

  list.forEach((entry, idx) => {
    // Support both backend field names AND local cache field names
    const date     = entry.created_at   || entry.date          || new Date().toISOString();
    const txId     = entry.id           || entry.transactionId || 'N/A';
    const item     = entry.produce_name || entry.item          || 'N/A';
    const grade    = entry.ai_grade     || entry.grade         || 'N/A';
    const qty      = parseFloat(entry.quantity)                || 0;
    const price    = parseFloat(entry.price)                   || 0;
    const total    = parseFloat(entry.total_amount || entry.total) || (qty * price);
    const status   = entry.status                              || 'completed';

    totalRevenue  += total;
    totalQuantity += qty;
    if (grade.toUpperCase() === 'A') gradeACount++;

    const txIdDisplay = String(txId).length > 10
      ? String(txId).substring(0, 10) + '…'
      : String(txId);

    const tr = document.createElement('tr');

    if (isNewHTML) {
      // New government HTML — 9 columns with row number
      tr.innerHTML = `
        <td class="row-num">${idx + 1}</td>
        <td style="white-space:nowrap;">${formatDate(date)}</td>
        <td class="tx-id" title="${txId}">${txIdDisplay}</td>
        <td>${item}</td>
        <td>${getGradeBadge(grade)}</td>
        <td>${qty > 0 ? qty.toFixed(2) + ' kg' : '—'}</td>
        <td>${formatCurrency(price)}</td>
        <td class="amount-strong">${formatCurrency(total)}</td>
        <td>${getStatusBadge(status)}</td>
      `;
    } else {
      // Old HTML — 8 columns, no row number
      tr.innerHTML = `
        <td>${formatDate(date)}</td>
        <td class="transaction-id">${txIdDisplay}</td>
        <td>${item}</td>
        <td>${getGradeBadge(grade)}</td>
        <td>${qty > 0 ? qty.toFixed(2) + ' kg' : qty + ' kg'}</td>
        <td>${formatCurrency(price)}</td>
        <td><strong>${formatCurrency(total)}</strong></td>
        <td>${getStatusBadge(status)}</td>
      `;
    }

    body.appendChild(tr);
  });

  // Update stat boxes (new HTML only)
  if (document.getElementById('statTotal'))    document.getElementById('statTotal').textContent    = list.length;
  if (document.getElementById('statRevenue'))  document.getElementById('statRevenue').textContent  = formatCurrency(totalRevenue);
  if (document.getElementById('statGradeA'))   document.getElementById('statGradeA').textContent   = gradeACount;
  if (document.getElementById('statQuantity')) document.getElementById('statQuantity').textContent = totalQuantity.toFixed(1) + ' kg';
}

// ═══════════════════════════════════════════════════════
//  SHOW / HIDE ERROR
// ═══════════════════════════════════════════════════════
function showError(message) {
  const d         = document.getElementById('errorMessage');
  d.textContent   = '❌ ' + message;
  d.style.display = 'block';
  if (document.getElementById('loadingSpinner')) {
    document.getElementById('loadingSpinner').style.display = 'none';
  }
}

function hideError() {
  const d = document.getElementById('errorMessage');
  if (d) d.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//  SYNC
//  Fetches from backend, merges with local cache,
//  falls back to local only if backend unreachable.
// ═══════════════════════════════════════════════════════
async function syncHistory() {
  hideError();

  if (document.getElementById('loadingSpinner'))
    document.getElementById('loadingSpinner').style.display = 'block';
  if (document.getElementById('tableWrap'))
    document.getElementById('tableWrap').style.display = 'none';
  if (document.getElementById('historyTable'))
    document.getElementById('historyTable').style.display = 'none';
  if (document.getElementById('emptyState'))
    document.getElementById('emptyState').style.display = 'none';
  if (document.getElementById('statsRow'))
    document.getElementById('statsRow').style.display = 'none';
  if (document.getElementById('syncStatus'))
    document.getElementById('syncStatus').textContent = '';

  const localHistory = getLocalHistory();

  try {
    const backendHistory = await fetchHistoryFromBackend();

    // Build set of backend IDs so we don't duplicate
    const backendIds = new Set(
      (backendHistory || [])
        .map(t => String(t.id || t.transactionId || ''))
        .filter(id => id && id !== 'N/A')
    );

    // Merge: backend records first, then any local-only entries not on server
    const localOnly = localHistory.filter(entry => {
      const id = String(entry.transactionId || entry.id || '');
      return !id || !backendIds.has(id);
    });

    const merged = [...(backendHistory || []), ...localOnly];

    renderHistory(merged);

    document.getElementById('syncStatus').textContent =
      backendHistory && backendHistory.length > 0
        ? '✔ Synced from blockchain ledger'
        : '⚠ Showing local cache (server returned empty)';

    // Update local cache with merged data
    if (merged.length > 0) {
      localStorage.setItem('vegegrade_history', JSON.stringify(merged));
    }

    console.log('[History] ✅ Rendered', merged.length, 'records');

  } catch (err) {
    console.error('[History] Sync error →', err);
    showError(err.message);

    // Always fall back to local cache on any error
    if (localHistory.length > 0) {
      renderHistory(localHistory);
      document.getElementById('syncStatus').textContent =
        '⚠ Showing local cache (could not reach server)';
    } else {
      renderHistory([]);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  CLEAR LOCAL CACHE
// ═══════════════════════════════════════════════════════
function clearLocalHistory() {
  if (!confirm(
    'Clear local transaction cache?\n\n' +
    'This will not delete blockchain records.'
  )) return;

  localStorage.removeItem('vegegrade_history');
  document.getElementById('syncStatus').textContent = '✔ Local cache cleared';
  syncHistory();
}

// ═══════════════════════════════════════════════════════
//  INIT — auth check then load
//  Falls back gracefully instead of hard-redirecting
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  console.log('[History] Page loaded.');

  fetch('/api/auth/profile')
    .then(res => {
      if (!res.ok) {
        // Not authenticated — load local cache instead of redirecting
        console.warn('[History] Not authenticated. Loading local cache.');
        const local = getLocalHistory();
        renderHistory(local);
        if (document.getElementById('syncStatus')) {
          document.getElementById('syncStatus').textContent = '⚠ Not logged in — showing local cache only';
        }
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (data) syncHistory();
    })
    .catch(err => {
      console.error('[History] Auth check error →', err);
      const local = getLocalHistory();
      renderHistory(local);
      if (document.getElementById('syncStatus')) {
        document.getElementById('syncStatus').textContent = '⚠ Offline — showing local cache';
      }
    });
});