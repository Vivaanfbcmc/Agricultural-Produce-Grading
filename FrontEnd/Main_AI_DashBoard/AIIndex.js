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

    // Default location and commodity (replace with real values from farmer profile or UI)
    // TODO: wire these to actual farmer/location inputs or inject via server-side variable
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
      
      // Display file info
      fileName.textContent = file.name;
      fileSize.textContent = formatFileSize(file.size);
      
      // Create image preview
      const reader = new FileReader();
      reader.onload = function(e) {
        previewImage.src = e.target.result;
        resultImage.src = e.target.result;
        
        // Get image dimensions
        const img = new Image();
        img.onload = function() {
          fileDimensions.textContent = `${img.width} × ${img.height}px`;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      
      // Show preview and enable analyze button
      previewContainer.style.display = 'block';
      analyzeBtn.disabled = false;
    }

    // Format file size
    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' bytes';
      else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
      else return (bytes / 1048576).toFixed(2) + ' MB';
    }

    // Simulate AI analysis
    function analyzeImage() {
      // Show loading, hide other elements
      loading.style.display = 'block';
      analyzeBtn.disabled = true;
      
      // Simulate API call delay
      setTimeout(async () => {
        // Hide loading
        loading.style.display = 'none';
        
        // Generate random results (in real app, this would come from AI API)
        const grades = ['A', 'B', 'C', 'D'];
        const grade = grades[Math.floor(Math.random() * grades.length)];
        
        // Set price based on grade
        let priceRange;
        switch(grade) {
          case 'A': priceRange = '₹40–₹60 / kg'; break;
          case 'B': priceRange = '₹30–₹45 / kg'; break;
          case 'C': priceRange = '₹20–₹35 / kg'; break;
          case 'D': priceRange = '₹10–₹25 / kg'; break;
          default: priceRange = '₹20–₹40 / kg';
        }
        
        // Update result UI
        gradeValue.textContent = grade;
        // Show temporary range while we fetch market price
        priceValue.textContent = priceRange + ' (estimating market price...)';

        // Fetch market price from backend price API and update UI dynamically
        try {
          const priceResp = await getPriceForGrade(DEFAULT_STATE, DEFAULT_DISTRICT, DEFAULT_COMMODITY, grade);
          if (priceResp && priceResp.success) {
            const sel = priceResp.selected_price;
            const type = priceResp.selected_price_type || '';
            // Format number as INR without decimals
            const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(sel);
            priceValue.textContent = `${formatted} per unit (for Grade ${grade})`;
            // Optionally show which price type was used
            const note = document.createElement('div');
            note.style.fontSize = '12px';
            note.style.marginTop = '6px';
            note.style.color = 'rgba(255,255,255,0.8)';
            note.textContent = `Price source: ${type.replace('_', ' ').toUpperCase()}`;
            // Remove previous note if any
            const prevNote = document.getElementById('priceSourceNote');
            if (prevNote) prevNote.remove();
            note.id = 'priceSourceNote';
            priceValue.parentNode.appendChild(note);
          } else {
            // keep the estimated range already shown
            console.warn('Price API did not return a valid response, keeping estimate.');
          }
        } catch (err) {
          console.error('Error fetching price for grade:', err);
        }
        
        // Generate analysis details based on grade
        generateAnalysisDetails(grade);
        
        // Show result section
        resultSection.style.display = 'block';
        
        // Scroll to results
        resultSection.scrollIntoView({ behavior: 'smooth' });
      }, 2000);
    }

    // Generate detailed analysis based on grade
    function generateAnalysisDetails(grade) {
      analysisDetails.innerHTML = '';
      
      const details = {
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
        'D': [
          { label: 'Freshness', value: 'Poor', color: '#dc2626' },
          { label: 'Color', value: 'Dull & Discolored', color: '#dc2626' },
          { label: 'Texture', value: 'Soft & Wilted', color: '#dc2626' },
          { label: 'Size Consistency', value: 'Highly Inconsistent', color: '#dc2626' },
          { label: 'Defects', value: 'Significant Damage', color: '#dc2626' }
        ]
      };
      
      const gradeDetails = details[grade] || details['B'];
      
      gradeDetails.forEach(detail => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${detail.label}:</strong> <span style="color: ${detail.color}">${detail.value}</span>`;
        analysisDetails.appendChild(li);
      });
    }

    // Helper: call backend /api/price to get market prices for a grade
    // Base URL for backend price API. You can override by setting `window.PRICE_API_BASE` from server-side.
    // If the frontend is served from the backend (port 5000), use relative path. Otherwise default to localhost:5000.
    const PRICE_API_BASE = (typeof window.PRICE_API_BASE !== 'undefined')
      ? window.PRICE_API_BASE
      : (location.port === '5000' ? '' : 'http://localhost:5000');

    async function getPriceForGrade(state, district, commodity, grade){
      // Ensure values provided
      if(!state || !district || !commodity || !grade) return null;
      try{
        const params = new URLSearchParams({ state, district, commodity, grade });
        const url = (PRICE_API_BASE ? PRICE_API_BASE : '') + '/api/price?' + params.toString();
        console.log('Fetching price from:', url);
        const res = await fetch(url);
        if(!res.ok){
          console.error('Price API HTTP error', res.status, await res.text());
          return null;
        }
        const json = await res.json();
        return json;
      }catch(err){
        console.error('getPriceForGrade error:', err);
        return null;
      }
    }

    // Reset the application to analyze another image
    function resetApp() {
      // Reset file input
      fileInput.value = '';
      
      // Hide preview and results
      previewContainer.style.display = 'none';
      resultSection.style.display = 'none';
      
      // Reset analyze button
      analyzeBtn.disabled = true;
      
      // Clear image preview
      previewImage.src = '';
      resultImage.src = '';
      
      // Reset current image
      currentImage = null;
      
      // Scroll back to upload area
      uploadArea.scrollIntoView({ behavior: 'smooth' });
    }

    // Initialize with a sample image for demo
    window.addEventListener('DOMContentLoaded', () => {
      // For demo purposes, we can simulate an initial state
      // In a real app, you would not have this
      console.log('VEGEGRADE AI Vegetable Grading System ready.');
    });