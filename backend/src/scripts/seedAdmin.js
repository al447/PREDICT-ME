require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      console.error('Error: Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
      existing.role = 'admin';
      existing.password = hash;
      existing.isActive = true;
      existing.authProvider = existing.authProvider || 'email';
      await existing.save();
      console.log(`✅ Admin updated: ${email}`);
    } else {
      await User.create({
        email: email.toLowerCase(),
        password: hash,
        role: 'admin',
        authProvider: 'email',
        username: 'admin',
        balance: 0,
        isActive: true,
      });
      console.log(`✅ Admin created: ${email}`);
    }

    process.exit(0);
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  }
})();
