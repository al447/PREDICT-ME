const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { getComments, postComment, likeComment, deleteComment } = require('../controllers/commentController');

// GET /api/comments/:marketId — get comments for a market (public, but optionalAuth for likedByMe)
router.get('/:marketId', optionalAuth, getComments);

// POST /api/comments/:marketId — post a comment (authenticated)
router.post('/:marketId', protect, postComment);

// POST /api/comments/:commentId/like — toggle like (authenticated)
router.post('/:commentId/like', protect, likeComment);

// DELETE /api/comments/:commentId — delete a comment (author or admin)
router.delete('/:commentId', protect, deleteComment);

module.exports = router;
