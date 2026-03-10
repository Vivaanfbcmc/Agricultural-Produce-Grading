
	// Format date to readable format
	function formatDate(iso) {
		const d = new Date(iso);
		return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
	}

	// Format currency
	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR'
		}).format(amount);
	}

	// Get grade badge HTML
	function getGradeBadge(grade) {
		const gradeUpper = (grade || 'N/A').toUpperCase();
		return `<span class="grade-badge grade-${gradeUpper}">${gradeUpper}</span>`;
	}

	// Fetch history from backend blockchain API
	async function fetchHistoryFromBackend() {
		try {
			const response = await fetch('/api/blockchain/history', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error('Not authenticated. Please log in.');
				}
				throw new Error('Failed to fetch transaction history');
			}

			const data = await response.json();
			return data.transactions || data || [];
		} catch (err) {
			console.error('Backend fetch error:', err);
			throw err;
		}
	}

	// Get local history from localStorage (fallback)
	function getLocalHistory() {
		return JSON.parse(localStorage.getItem('vegegrade_history') || '[]');
	}

	// Render history entries into the table
	function renderHistory(list) {
		const table = document.getElementById('historyTable');
		const body = document.getElementById('historyBody');
		const empty = document.getElementById('emptyState');
		const spinner = document.getElementById('loadingSpinner');

		spinner.style.display = 'none';
		body.innerHTML = '';

		if (!list || !list.length) {
			table.style.display = 'none';
			empty.style.display = 'block';
			return;
		}

		empty.style.display = 'none';
		table.style.display = 'table';

		list.forEach(entry => {
			const tr = document.createElement('tr');

			// Handle both backend format and local storage format
			const date = entry.created_at || entry.date || new Date().toISOString();
			const txId = entry.id || entry.transactionId || 'N/A';
			const item = entry.produce_name || entry.item || 'N/A';
			const grade = entry.ai_grade || entry.grade || 'N/A';
			const quantity = entry.quantity || entry.quantity || '0';
			const price = entry.price || entry.price || 0;
			const total = entry.total || (parseFloat(quantity) * parseFloat(price)) || 0;
			const status = entry.status || 'completed';

			// Handle txId - could be number or string
			const txIdDisplay = txId ? String(txId).substring(0, 8) + '...' : 'N/A';

			tr.innerHTML = `
					<td>${formatDate(date)}</td>
					<td class="transaction-id">${txIdDisplay}</td>
					<td>${item}</td>
					<td>${getGradeBadge(grade)}</td>
					<td>${quantity} kg</td>
					<td>${formatCurrency(price)}</td>
					<td><strong>${formatCurrency(total)}</strong></td>
					<td><span class="grade-badge grade-${status === 'verified' ? 'A' : 'B'}">${status}</span></td>
				`;

			body.appendChild(tr);
		});
	}

	// Show error message
	function showError(message) {
		const errorDiv = document.getElementById('errorMessage');
		errorDiv.textContent = '❌ ' + message;
		errorDiv.style.display = 'block';
		document.getElementById('loadingSpinner').style.display = 'none';
	}

	// Hide error message
	function hideError() {
		document.getElementById('errorMessage').style.display = 'none';
	}

	// Sync history from backend (primary) or localStorage (fallback)
	// Replace syncHistory() in history.html with this:
	async function syncHistory() {
		hideError();
		document.getElementById('loadingSpinner').style.display = 'block';
		document.getElementById('historyTable').style.display = 'none';
		document.getElementById('emptyState').style.display = 'none';
		document.getElementById('syncStatus').textContent = '';

		const localHistory = getLocalHistory();

		try {
			const backendHistory = await fetchHistoryFromBackend();

			// Build a set of known backend IDs
			const backendIds = new Set(
					(backendHistory || []).map(t => String(t.id || t.transactionId || ''))
							.filter(id => id && id !== 'N/A')
			);

			// Merge: backend first, then any local entries not already in backend
			const localOnly = localHistory.filter(entry => {
				const id = String(entry.transactionId || entry.id || '');
				return !id || !backendIds.has(id);
			});

			const merged = [...(backendHistory || []), ...localOnly];

			if (merged.length > 0) {
				renderHistory(merged);
				document.getElementById('syncStatus').textContent =
						backendHistory && backendHistory.length > 0
								? '✓ Synced from blockchain'
								: '⚠ Showing local cache (offline)';
				// Update localStorage with merged data
				localStorage.setItem('vegegrade_history', JSON.stringify(merged));
			} else {
				renderHistory([]);
			}
		} catch (err) {
			console.error('Sync error:', err);
			showError(err.message);

			if (localHistory.length > 0) {
				renderHistory(localHistory);
				document.getElementById('syncStatus').textContent =
						'⚠ Showing local cache (error fetching from server)';
			} else {
				renderHistory([]);
			}
		}
	}


	// Clear local history cache
	function clearLocalHistory() {
		if (!confirm('Clear local transaction cache? This will not delete blockchain records.')) {
			return;
		}

		localStorage.removeItem('vegegrade_history');
		document.getElementById('syncStatus').textContent = '✓ Local cache cleared';

		// Refresh from backend
		syncHistory();
	}

	// Initialize on page load
	document.addEventListener('DOMContentLoaded', () => {
		// Check if user is authenticated
		fetch('/api/auth/profile')
				.then(res => {
					if (!res.ok) {
						// Not authenticated, redirect to login
						window.location.href = '/';
						return;
					}
					return res.json();
				})
				.then(data => {
					if (data && data.user) {
						// User authenticated, sync history
						syncHistory();
					}
				})
				.catch(err => {
					console.error('Auth check error:', err);
					// Fallback to local history
					const localHistory = getLocalHistory();
					renderHistory(localHistory);
				});
	});
