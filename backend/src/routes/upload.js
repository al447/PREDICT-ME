const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

/**
 * POST /api/upload/image
 * Upload a market image
 */
router.post('/image', adminAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    // For local dev: use relative path (works with Vite proxy)
    // For production: use absolute path to backend
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const imageUrl = isProduction 
      ? `${backendUrl}/uploads/${req.file.filename}`
      : `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/upload/image/:filename
 * Delete an uploaded image (admin only)
 */
router.delete('/image/:filename', adminAuth, async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(uploadsDir, filename);

    // Security check - prevent directory traversal
    if (!filepath.startsWith(uploadsDir)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.json({ success: true, message: 'Image deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Image not found' });
    }
  } catch (err) {
    next(err);
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large (max 5MB)' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  next(err);
});

module.exports = router;
