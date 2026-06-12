const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/helpers');
const RefreshToken = require('../models/RefreshToken');

const REFRESH_TOKEN_TTL_DAYS = 7;

const issueTokens = async (userId) => {
  const accessToken = generateAccessToken(userId);
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, tokenHash, expiresAt });
  return { accessToken, refreshToken: rawRefresh };
};
const { verifyWalletSignature } = require('../utils/walletAuth');
const { generateUniqueCode, attributeReferral, getCodeForUser } = require('../services/referralService');
const walletService = require('../services/walletService');
const balanceSyncService = require('../services/balanceSyncService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const { Magic } = require('@magic-sdk/admin');
const magicAdmin = process.env.MAGIC_SECRET_KEY ? new Magic(process.env.MAGIC_SECRET_KEY) : null;

const googleAuth = async (req, res, next) => {
  try {
    const { credential, referralCode } = req.body;
    if (!credential) return res.status(400).json({ success: false, error: 'No credential provided' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    const isNewUser = !user;
    let referralResult = null;
    
    if (!user) {
      user = await User.create({
        googleId,
        email,
        username: name,
        avatar: picture || '',
        authProvider: 'google',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });
      
      // Generate referral code for new user
      await generateUniqueCode(user._id);
      
      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[Referral] Attempting attribution for new Google user ${user._id} with code ${referralCode}`);
        try {
          referralResult = await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress });
          if (referralResult.success) {
            console.log(`[Referral] Successfully attributed referral for user ${user._id}`);
          } else {
            console.log(`[Referral] Failed to attribute: ${referralResult.reason}`);
          }
        } catch (err) {
          console.error('[Referral] Google signup attribution error:', err.message);
        }
      }
    } else {
      // Update returning user's metadata
      const updates = { lastLogin: new Date() };
      if (!user.googleId) updates.googleId = googleId;
      if (picture && !user.avatar) updates.avatar = picture;
      await User.findByIdAndUpdate(user._id, updates);
    }
    
    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);

    // Provision proxy wallet + sync balance (fire-and-forget — never blocks login)
    if (process.env.ONCHAIN_ENABLED === 'true') {
      const freshUser = await User.findById(user._id);
      walletService.ensureSmartWallet(freshUser).then(wallet => {
        balanceSyncService.syncUser(freshUser).catch(() => {});
      }).catch(() => {});
    }

    res.json({
      success: true,
      isNewUser,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
        smartWallet: user.smartWallet,
      },
      referralAttribution: referralResult ? {
        success: referralResult.success,
        reason: referralResult.reason || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
};

const walletAuth = async (req, res, next) => {
  try {
    const { walletAddress, signature, message, referralCode, chainId } = req.body;
    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ success: false, error: 'Missing wallet auth fields' });
    }

    const recoveredAddress = await verifyWalletSignature(message, signature, chainId);
    if (!recoveredAddress) {
      return res.status(401).json({ 
        success: false, 
        error: 'Signature verification failed or expired. Please try signing in again.' 
      });
    }
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Signature does not match wallet address' });
    }

    // Check if user is already logged in (Google) - extract from Authorization header
    const authHeader = req.headers.authorization;
    let loggedInUser = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        loggedInUser = await User.findById(decoded.userId);
      } catch (e) { /* invalid token, ignore */ }
    }

    // Check if another user already owns this wallet
    const existingWalletUser = await User.findOne({ 
      walletAddress: walletAddress.toLowerCase() 
    });

    let user;
    let isNewUser = false;
    let referralResult = null;
    
    if (loggedInUser) {
      // SCENARIO: Google user signing wallet for the first time
      if (existingWalletUser && existingWalletUser._id.toString() !== loggedInUser._id.toString()) {
        return res.status(409).json({ 
          success: false, 
          error: 'This wallet is already linked to another account' 
        });
      }
      // Link wallet to logged-in account
      loggedInUser.walletAddress = walletAddress.toLowerCase();
      await loggedInUser.save();
      user = loggedInUser;
      isNewUser = false;
    } else if (existingWalletUser) {
      // SCENARIO: Returning wallet user logging in
      user = existingWalletUser;
      isNewUser = false;
      await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    } else {
      // SCENARIO: Brand new wallet user
      user = await User.create({
        walletAddress: walletAddress.toLowerCase(),
        username: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        authProvider: 'wallet',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });
      isNewUser = true;
      
      // Generate referral code for new user
      await generateUniqueCode(user._id);
      
      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[Referral] Attempting attribution for new wallet user ${user._id} with code ${referralCode}`);
        try {
          referralResult = await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress });
          if (referralResult.success) {
            console.log(`[Referral] Successfully attributed referral for user ${user._id}`);
          } else {
            console.log(`[Referral] Failed to attribute: ${referralResult.reason}`);
          }
        } catch (err) {
          console.error('[Referral] Wallet signup attribution error:', err.message);
        }
      }
    }
    
    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);

    // Provision proxy wallet + sync balance (fire-and-forget)
    if (process.env.ONCHAIN_ENABLED === 'true') {
      const freshUser = await User.findById(user._id);
      walletService.ensureSmartWallet(freshUser).then(() => {
        balanceSyncService.syncUser(freshUser).catch(() => {});
      }).catch(() => {});
    }

    res.json({
      success: true,
      isNewUser,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
        smartWallet: user.smartWallet,
      },
      referralAttribution: referralResult ? {
        success: referralResult.success,
        reason: referralResult.reason || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
};

const magicAuth = async (req, res, next) => {
  try {
    if (!magicAdmin) {
      return res.status(500).json({ success: false, error: 'Magic auth is not configured on the server' });
    }

    const { didToken, referralCode } = req.body;
    if (!didToken) return res.status(400).json({ success: false, error: 'No Magic DID token provided' });

    // magic-sdk v28+ uses a JWT-based token format that is incompatible with
    // the local ecRecover verification in @magic-sdk/admin v2. We validate the
    // token exclusively via Magic's API (getMetadataByToken), which works for
    // all token formats and is the officially recommended approach.

    // Resolve the authenticated identity from Magic
    let metadata;
    try {
      metadata = await magicAdmin.users.getMetadataByToken(didToken);
      console.log('[Magic Auth] Metadata fetched, email:', metadata?.email, 'address:', metadata?.publicAddress);
    } catch (e) {
      console.error('[Magic Auth] Failed to fetch user metadata:', e.message);
      return res.status(401).json({ success: false, error: 'Failed to verify Magic user identity' });
    }
    
    const rawEmail = (metadata.email || '').toLowerCase().trim();
    // Sanitize: reject implausibly long emails (> 254 chars per RFC 5321)
    const email = rawEmail.length <= 254 ? rawEmail : '';
    const publicAddress = metadata.publicAddress ? metadata.publicAddress.toLowerCase() : null;

    if (!email && !publicAddress) {
      return res.status(400).json({ success: false, error: 'Magic returned no identifiable account' });
    }

    let user = email ? await User.findOne({ email }) : null;
    const isNewUser = !user;
    let referralResult = null;

    if (!user) {
      user = await User.create({
        email: email || undefined,
        username: email ? email.split('@')[0] : `${publicAddress.slice(0, 6)}...${publicAddress.slice(-4)}`,
        walletAddress: publicAddress || undefined,
        authProvider: 'magic',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });

      // Generate referral code for new user
      await generateUniqueCode(user._id);

      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        try {
          referralResult = await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress });
        } catch (err) {
          console.error('[Referral] Magic signup attribution error:', err.message);
        }
      }
    } else {
      // Update returning user's metadata
      const updates = { lastLogin: new Date() };
      if (publicAddress && !user.walletAddress) updates.walletAddress = publicAddress;
      if (Object.keys(updates).length) await User.findByIdAndUpdate(user._id, updates);
    }

    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);

    // Provision proxy wallet + sync balance (fire-and-forget)
    if (process.env.ONCHAIN_ENABLED === 'true') {
      const freshUser = await User.findById(user._id);
      walletService.ensureSmartWallet(freshUser).then(() => {
        balanceSyncService.syncUser(freshUser).catch(() => {});
      }).catch(() => {});
    }

    res.json({
      success: true,
      isNewUser,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
        smartWallet: user.smartWallet,
      },
      referralAttribution: referralResult ? {
        success: referralResult.success,
        reason: referralResult.reason || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        createdAt: user.createdAt,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

const refreshTokenHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash, revoked: false });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(stored.user).select('_id isActive');
    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, error: 'User not found or suspended' });
    }

    // Rotate: revoke old token and issue new pair
    stored.revoked = true;
    await stored.save();

    const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user._id);
    res.json({ success: true, token: accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await RefreshToken.updateOne({ tokenHash }, { revoked: true });
    }
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};

module.exports = { googleAuth, walletAuth, magicAuth, getMe, logout, refreshTokenHandler };
