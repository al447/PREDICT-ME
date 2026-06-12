require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const cats = ['crypto','sports','esports','politics','elections','finance','economy','tech','culture','geopolitics','iran','weather'];

  for (const cat of cats) {
    const markets = await Market.find({ categorySlug: cat }, 'title tags subCategory').limit(10).lean();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${cat.toUpperCase()}] — ${await Market.countDocuments({ categorySlug: cat })} markets`);
    console.log('='.repeat(60));
    markets.forEach(m => {
      const tags = (m.tags || []).slice(0, 5).join(', ');
      console.log(`  • ${m.title}`);
      console.log(`    tags: ${tags} | sub: ${m.subCategory || '—'}`);
    });
  }

  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
