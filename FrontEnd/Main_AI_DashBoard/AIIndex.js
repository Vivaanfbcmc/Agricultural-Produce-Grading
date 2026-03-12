// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileDimensions = document.getElementById('fileDimensions');
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const gradeValue = document.getElementById('gradeValue');
const priceValue = document.getElementById('priceValue');
const analysisDetails = document.getElementById('analysisDetails');

// Current state
let currentImage = null;

// CEDA commodity ID for Tomato
const DEFAULT_COMMODITY_ID = 23;

// Drag and drop functionality
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
});

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file (JPG, PNG, WebP).');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('File size should be less than 5MB.');
        return;
    }

    currentImage = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    const reader = new FileReader();
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        resultImage.src = e.target.result;

        const img = new Image();
        img.onload = function() {
            fileDimensions.textContent = `${img.width} × ${img.height}px`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    previewContainer.style.display = 'block';
    analyzeBtn.disabled = false;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// All API calls go through gateway
async function analyzeImage() {
    if (!currentImage) return;

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    resultSection.style.display = 'none';

    // Reset stored price
    analysisResults.price = '';

    try {
        // Step 1: Get grade from ML service via gateway
        const formData = new FormData();
        formData.append("image", currentImage);

        const mlRes = await fetch("/api/ml/analyze", {
            method: 'POST',
            body: formData
        });

        if (!mlRes.ok) {
            throw new Error(`ML service error: ${mlRes.status}`);
        }

        const mlJson = await mlRes.json();

        let grade = mlJson.grade || "Rotten";
        if (grade.toUpperCase() === "D") grade = "Rotten";
        grade = grade.toUpperCase();
        gradeValue.textContent = grade;

        // Store grade in analysisResults
        analysisResults.grade = grade;

        // Step 2: Get price from CEDA Smart Price server via gateway
        priceValue.textContent = "Fetching market price...";

        if (grade === 'ROTTEN') {
            // Rotten produce — no price needed
            priceValue.textContent = "₹0 — Rejected (rotten produce)";
            analysisResults.price = '0';
        } else {
            try {
                const priceRes = await fetch("/api/ceda-price", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commodity_id: DEFAULT_COMMODITY_ID,
                        grade: grade  // A, B, or C
                    })
                });

                const priceJson = await priceRes.json();

                if (priceJson.success && typeof priceJson.price === 'number') {
                    // Store clean numeric price for transaction modal
                    analysisResults.price = String(priceJson.price);

                    priceValue.textContent = `${priceJson.price_display} (Grade ${grade})`;
                } else {
                    priceValue.textContent = "Price not available for this grade.";
                    analysisResults.price = '';
                }
            } catch (priceErr) {
                console.warn('CEDA price fetch failed:', priceErr);
                priceValue.textContent = "Price not available (service offline).";
                analysisResults.price = '';
            }
        }

        generateAnalysisDetails(grade);
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error('Analysis error:', err);
        alert(`Error: ${err.message}`);
    } finally {
        loading.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// Generate analysis details for each grade
function generateAnalysisDetails(grade) {
    analysisDetails.innerHTML = '';

    const detailsMap = {
        'A': [
            { label: 'Freshness', value: 'Excellent', color: '#059669' },
            { label: 'Color', value: 'Vibrant & Uniform', color: '#059669' },
            { label: 'Texture', value: 'Firm & Crisp', color: '#059669' },
            { label: 'Size Consistency', value: 'Highly Consistent', color: '#059669' },
            { label: 'Defects', value: 'Minimal to None', color: '#059669' }
        ],
        'B': [
            { label: 'Freshness', value: 'Good', color: '#f59e0b' },
            { label: 'Color', value: 'Slightly Faded', color: '#f59e0b' },
            { label: 'Texture', value: 'Mostly Firm', color: '#f59e0b' },
            { label: 'Size Consistency', value: 'Moderately Consistent', color: '#f59e0b' },
            { label: 'Defects', value: 'Minor Blemishes', color: '#f59e0b' }
        ],
        'C': [
            { label: 'Freshness', value: 'Average', color: '#f97316' },
            { label: 'Color', value: 'Noticeably Faded', color: '#f97316' },
            { label: 'Texture', value: 'Some Soft Spots', color: '#f97316' },
            { label: 'Size Consistency', value: 'Inconsistent', color: '#f97316' },
            { label: 'Defects', value: 'Visible Blemishes', color: '#f97316' }
        ],
        'ROTTEN': [
            { label: 'Freshness', value: 'Poor', color: '#dc2626' },
            { label: 'Color', value: 'Dull & Discolored', color: '#dc2626' },
            { label: 'Texture', value: 'Soft & Wilted', color: '#dc2626' },
            { label: 'Size Consistency', value: 'Highly Inconsistent', color: '#dc2626' },
            { label: 'Defects', value: 'Significant Damage', color: '#dc2626' }
        ]
    };

    const gradeDetails = detailsMap[grade] || detailsMap['B'];
    gradeDetails.forEach(detail => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${detail.label}:</strong> <span style="color: ${detail.color}">${detail.value}</span>`;
        analysisDetails.appendChild(li);
    });
}

// Reset the app for another image
function resetApp() {
    fileInput.value = '';
    previewContainer.style.display = 'none';
    resultSection.style.display = 'none';
    analyzeBtn.disabled = true;
    previewImage.src = '';
    resultImage.src = '';
    currentImage = null;
    analysisResults = { grade: '', price: '', produceName: 'Tomato' };
    uploadArea.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('VEGEGRADE AI ready.');
    initializeTransactionModal();
});

// ==================== TRANSACTION MODAL FUNCTIONS ====================

// Track analysis results for transaction
let analysisResults = {
    grade: '',
    price: '',
    produceName: 'Tomato'
};

async function initializeTransactionModal() {
    // Fetch farmer ID from session on load
    try {
        const res = await fetch('/api/auth/profile');
        if (res.ok) {
            const data = await res.json();
            if (data.user && data.user.farmerId) {
                localStorage.setItem('farmerId', data.user.farmerId);
                localStorage.setItem('farmerName', data.user.fullName || '');
            }
        }
    } catch (err) {
        console.warn('Could not fetch profile for farmer ID:', err);
    }

    document.getElementById('quantity').addEventListener('input', calculateTotal);
    document.getElementById('price').addEventListener('input', calculateTotal);
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('quantity').value) || 0;
    const price = parseFloat(document.getElementById('price').value) || 0;
    const total = quantity * price;
    document.getElementById('totalAmount').textContent = `₹${total.toFixed(2)}`;
}

async function openTransactionModal() {
    const modal = document.getElementById('transactionModal');

    // Always re-fetch fresh farmer ID from session (fixes second-open issue)
    let farmerId = localStorage.getItem('farmerId') || '';
    try {
        const res = await fetch('/api/auth/profile');
        if (res.ok) {
            const data = await res.json();
            if (data.user && data.user.farmerId) {
                farmerId = data.user.farmerId;
                localStorage.setItem('farmerId', farmerId);
            }
        }
    } catch (err) {
        console.warn('Could not fetch profile:', err);
    }

    document.getElementById('farmerId').value = farmerId;

    const grade = gradeValue.textContent;

    // Use cleanly stored numeric price — no regex needed
    const price = analysisResults.price || '';

    analysisResults.grade = grade;

    document.getElementById('aiGrade').value = grade;
    document.getElementById('produceName').value = analysisResults.produceName;

    if (price) {
        document.getElementById('price').value = price;
        calculateTotal();
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeTransactionModal() {
    const modal = document.getElementById('transactionModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';

    // Reset form
    document.getElementById('transactionForm').reset();
    document.getElementById('errorMessage').style.display = 'none';
}

async function submitTransaction() {
    const farmerId = document.getElementById('farmerId').value;
    const produceName = document.getElementById('produceName').value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const aiGrade = document.getElementById('aiGrade').value;
    const price = parseFloat(document.getElementById('price').value);
    const status = document.getElementById('status').value;

    // Validation
    if (!farmerId) {
        showError('Farmer ID is missing. Please log in again.');
        return;
    }
    if (!quantity || quantity <= 0) {
        showError('Please enter a valid quantity');
        return;
    }
    if (!price || price <= 0) {
        showError('Please enter a valid price');
        return;
    }

    // Show loading state
    document.getElementById('submitTransactionBtn').disabled = true;
    document.getElementById('loadingModal').style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';

    try {
        const transactionData = {
            farmer_id: farmerId,
            produce_name: produceName,
            quantity: quantity,
            ai_grade: aiGrade,
            price: price,
            status: status
        };

        console.log('Submitting transaction:', transactionData);

        // Call the blockchain transaction API
        const response = await fetch('/api/blockchain/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transactionData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to create transaction');
        }

        // Success
        showSuccess(result);

    } catch (err) {
        console.error('Transaction submission error:', err);
        showError(err.message || 'Error creating transaction. Please try again.');
    } finally {
        document.getElementById('submitTransactionBtn').disabled = false;
        document.getElementById('loadingModal').style.display = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '❌ Error: ' + message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth' });
}

function showSuccess(result) {
    alert(
        'Transaction Created Successfully!\n\n' +
        'Transaction ID: ' + (result.transaction?.id || 'N/A') + '\n' +
        'Ledger Entry ID: ' + (result.ledger_entry_id || 'N/A') + '\n' +
        'Hash: ' + (result.hash ? result.hash.substring(0, 16) + '...' : 'N/A') + '\n\n' +
        'Your transaction has been recorded in the ledger.'
    );

    // Save to local history so history.html always shows it
    saveTransactionToHistory(result);

    closeTransactionModal();
    localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
}

function saveTransactionToHistory(result) {
    const farmerId = localStorage.getItem('farmerId') || 'guest';
    const historyKey = 'vegegrade_history_' + farmerId;
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');

    const qty = parseFloat(document.getElementById('quantity').value) || 0;
    const prc = parseFloat(document.getElementById('price').value) || 0;

    const historyEntry = {
        date: new Date().toISOString(),
        item: document.getElementById('produceName').value,
        quantity: qty + ' kg',
        price: prc,
        buyer: result.transaction?.buyer_name || 'Market Sale',
        total: qty * prc,
        transactionId: result.transaction?.id || 'N/A',
        id: result.transaction?.id || 'N/A',
        grade: document.getElementById('aiGrade').value,
        blockchainHash: result.hash ? result.hash.substring(0, 16) + '...' : 'N/A'
    };

    history.unshift(historyEntry);
    localStorage.setItem(historyKey, JSON.stringify(history));
    console.log('Transaction saved to history (key:', historyKey, '):', historyEntry);
}