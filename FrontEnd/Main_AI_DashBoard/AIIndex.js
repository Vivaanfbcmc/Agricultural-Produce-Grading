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

// Default location and commodity
const DEFAULT_STATE = 'Maharashtra';
const DEFAULT_DISTRICT = 'Sholapur';
const DEFAULT_COMMODITY = 'Tomato';

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

// CHANGE: All API calls now go through gateway
async function analyzeImage() {
    if (!currentImage) return;

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    resultSection.style.display = 'none';

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

        // Step 2: Get price from price API via gateway
        priceValue.textContent = "Fetching market price...";

        const priceRes = await fetch("/api/price", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                state: DEFAULT_STATE,
                district: DEFAULT_DISTRICT,
                commodity: DEFAULT_COMMODITY,
                grade
            })
        });

        const priceJson = await priceRes.json();

        if (priceJson.success && typeof priceJson.selectedPrice === 'number') {
            priceValue.textContent = `${new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
            }).format(priceJson.selectedPrice)} per unit (Grade ${grade})`;
        } else {
            priceValue.textContent = "Price not available for this grade.";
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
    uploadArea.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('VEGEGRADE AI ready.');
});