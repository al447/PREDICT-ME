const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  icon: { type: String, default: 'tag' },
  description: { type: String, default: '' },
  marketCount: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
});

module.exports = mongoose.model('Category', categorySchema);
