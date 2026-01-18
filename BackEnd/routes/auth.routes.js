import express from 'express';
import authController from "../controllers/auth.controller.js";
const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authController.getProfile);

export default router;