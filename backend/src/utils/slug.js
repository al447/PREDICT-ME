const Market = require('../models/Market');

const slugify = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);

const uniqueSlug = async (title) => {
  let base = slugify(title) || 'market';
  let slug = base;
  let i = 1;
  while (await Market.findOne({ slug })) {
    slug = `${base}-${i++}`;
  }
  return slug;
};

module.exports = { slugify, uniqueSlug };
