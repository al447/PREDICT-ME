require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');
const Category = require('../models/Category');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const cats = await Category.find({}, 'name slug').sort('order').lean();
  const total = await Market.countDocuments();
  const live = await Market.countDocuments({ conditionId: { $ne: null } });
  const mock = await Market.countDocuments({ conditionId: null });
  const sample = await Market.findOne({ conditionId: { $ne: null } }, 'title categorySlug conditionId subCategory volume24hr').lean();

  console.log('\n=== DB Status ===');
  console.log('Categories:', cats.map(c => c.slug).join(', '));
  console.log('Total markets:', total);
  console.log('Live (Polymarket):', live);
  console.log('Mocks remaining:', mock);
  if (sample) {
    console.log('\nSample live market:');
    console.log(' title:', sample.title);
    console.log(' category:', sample.categorySlug);
    console.log(' subCategory:', sample.subCategory);
    console.log(' volume24hr:', sample.volume24hr);
    console.log(' conditionId:', sample.conditionId);
  }
  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
