require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../models/Market');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const m = await Market.findOne({ onChain: true })
    .select('title conditionId outcomes yesTokenId noTokenId').lean();
  console.log('Market    :', m?.title?.slice(0, 60));
  console.log('conditionId:', m?.conditionId);
  console.log('yesTokenId :', m?.yesTokenId || m?.outcomes?.[0]?.tokenId);
  console.log('noTokenId  :', m?.noTokenId  || m?.outcomes?.[1]?.tokenId);
  await mongoose.disconnect();
});
