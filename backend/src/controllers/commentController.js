const Comment = require('../models/Comment');
const Market = require('../models/Market');

const getComments = async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const market = await Market.findById(marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const total = await Comment.countDocuments({ market: marketId });
    const comments = await Comment.find({ market: marketId })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('user', 'username avatar')
      .lean();

    res.json({
      success: true,
      comments: comments.map(c => ({
        _id: c._id,
        body: c.body,
        likes: c.likes,
        likedByMe: req.user ? c.likedBy?.some(id => id.toString() === req.user._id.toString()) : false,
        user: {
          _id: c.user?._id,
          username: c.user?.username || 'Anonymous',
          avatar: c.user?.avatar || '',
        },
        createdAt: c.createdAt,
      })),
      total,
    });
  } catch (error) {
    next(error);
  }
};

const postComment = async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const { body } = req.body;
    const userId = req.user._id;

    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Comment body is required' });
    }
    if (body.trim().length > 2000) {
      return res.status(400).json({ success: false, error: 'Comment must be under 2000 characters' });
    }

    const market = await Market.findById(marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const comment = await Comment.create({
      market: marketId,
      user: userId,
      body: body.trim(),
    });

    await comment.populate('user', 'username avatar');

    res.status(201).json({
      success: true,
      comment: {
        _id: comment._id,
        body: comment.body,
        likes: 0,
        likedByMe: false,
        user: {
          _id: comment.user?._id,
          username: comment.user?.username || 'Anonymous',
          avatar: comment.user?.avatar || '',
        },
        createdAt: comment.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

const likeComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const alreadyLiked = comment.likedBy.some(id => id.toString() === userId.toString());
    if (alreadyLiked) {
      // Unlike
      await Comment.findByIdAndUpdate(commentId, {
        $pull: { likedBy: userId },
        $inc: { likes: -1 },
      });
      return res.json({ success: true, liked: false });
    }

    // Like
    await Comment.findByIdAndUpdate(commentId, {
      $addToSet: { likedBy: userId },
      $inc: { likes: 1 },
    });
    res.json({ success: true, liked: true });
  } catch (error) {
    next(error);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    // Only comment author or admin can delete
    if (comment.user.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await Comment.findByIdAndDelete(commentId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getComments, postComment, likeComment, deleteComment };
