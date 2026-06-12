const Category = require('../models/Category');
const Market = require('../models/Market');

const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ order: 1 });
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const count = await Market.countDocuments({ categorySlug: cat.slug, status: 'active' });
        return { ...cat.toObject(), marketCount: count };
      })
    );
    res.json({ success: true, categories: categoriesWithCounts });
  } catch (error) {
    next(error);
  }
};

const getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    const count = await Market.countDocuments({ categorySlug: category.slug, status: 'active' });
    res.json({ success: true, category: { ...category.toObject(), marketCount: count } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCategories, getCategoryBySlug };
