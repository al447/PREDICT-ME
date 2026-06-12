require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../models/Market');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const m = await Market.findOne({ onChain: true }).lean();
  console.log('Keys:', Object.keys(m));
  console.log('outcomes sample:', JSON.stringify(m.outcomes?.slice(0,2), null, 2));
  await mongoose.disconnect();
});
