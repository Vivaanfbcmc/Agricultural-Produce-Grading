const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.get('/profile', (req, res) => {
    if (!req.session.isAuth || !req.session.user) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    res.json(req.session.user);
});


module.exports = router;
