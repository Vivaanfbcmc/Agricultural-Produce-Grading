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
      setTimeout(() => {
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
        priceValue.textContent = priceRange;
        
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