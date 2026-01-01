const express = require('express');
const router = express.Router();
const { getVegetablePrice, AgmarknetPriceFetcher } = require('./priceapi');

// POST /api/price
// Body: { state, district, commodity, grade }
router.post('/', async (req, res) => {
  try {
    const { state, district, commodity, grade } = req.body || {};

    if (!state || !district || !commodity || !grade) {
      return res.status(400).json({ success: false, error: 'Missing parameters', message: 'Provide state, district, commodity and grade' });
    }

    // Use the utility to get price info
    const result = await getVegetablePrice({ state, district, commodity, grade });

    if (!result || !result.success) {
      return res.status(500).json({ success: false, error: result?.error || 'Price fetch failed', message: result?.message || 'Unable to fetch price' });
    }

    const data = result.data || {};

    // Build response with required fields: min_price, modal_price, max_price
    const response = {
      success: true,
      min_price: Number(data.minPrice) || 0,
      modal_price: Number(data.modalPrice) || 0,
      max_price: Number(data.maxPrice) || 0,
      // selected_price: follow rule: if grade A -> max_price, B -> modal_price, C -> min_price
      selected_price: (function(){
        const g = (grade || '').toString().toUpperCase();
        if (g === 'A') return Number(data.maxPrice) || 0;
        if (g === 'B') return Number(data.modalPrice) || 0;
        if (g === 'C') return Number(data.minPrice) || 0;
        return Number(data.modalPrice) || 0;
      })(),
      selected_price_type: (function(){
        const g = (grade || '').toString().toUpperCase();
        if (g === 'A') return 'max_price';
        if (g === 'B') return 'modal_price';
        if (g === 'C') return 'min_price';
        return 'modal_price';
      })(),
      raw: data
    };

    return res.json(response);
  } catch (err) {
    console.error('Price route error:', err);
    return res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Also support GET for quick testing: /api/price?state=...&district=...&commodity=...&grade=A
router.get('/', async (req, res) => {
  try {
    const { state, district, commodity, grade } = req.query || {};
    if (!state || !district || !commodity || !grade) {
      return res.status(400).json({ success: false, error: 'Missing parameters', message: 'Provide state, district, commodity and grade as query parameters' });
    }

    const result = await getVegetablePrice({ state, district, commodity, grade });

    if (!result || !result.success) {
      return res.status(500).json({ success: false, error: result?.error || 'Price fetch failed', message: result?.message || 'Unable to fetch price' });
    }

    const data = result.data || {};
    const response = {
      success: true,
      min_price: Number(data.minPrice) || 0,
      modal_price: Number(data.modalPrice) || 0,
      max_price: Number(data.maxPrice) || 0,
      selected_price: (function(){
        const g = (grade || '').toString().toUpperCase();
        if (g === 'A') return Number(data.maxPrice) || 0;
        if (g === 'B') return Number(data.modalPrice) || 0;
        if (g === 'C') return Number(data.minPrice) || 0;
        return Number(data.modalPrice) || 0;
      })(),
      selected_price_type: (function(){
        const g = (grade || '').toString().toUpperCase();
        if (g === 'A') return 'max_price';
        if (g === 'B') return 'modal_price';
        if (g === 'C') return 'min_price';
        return 'modal_price';
      })(),
      raw: data
    };

    return res.json(response);
  } catch (err) {
    console.error('Price GET route error:', err);
    return res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

module.exports = router;
