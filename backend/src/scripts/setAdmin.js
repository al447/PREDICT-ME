/**
 * Promote an existing user to admin role.
 * Usage: node src/scripts/setAdmin.js <email_or_username>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: node src/scripts/setAdmin.js <email_or_username>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
  });
  if (!user) {
    console.error(`User not found: ${identifier}`);
    process.exit(1);
  }
  user.role = 'admin';
  await user.save();
  console.log(`✅ ${user.username || user.email} is now an admin (role=admin)`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
