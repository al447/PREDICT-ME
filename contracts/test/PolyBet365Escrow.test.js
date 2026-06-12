const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('PolyBet365Escrow', function () {
  let usdt, escrow;
  let owner, alice, bob, carol;

  const SHARE_PRICE  = ethers.parseUnits('1', 6);   // 1 USDT
  const FEE_BPS      = 200n;
  const BPS_DENOM    = 10_000n;
  const FAUCET_AMT   = ethers.parseUnits('10000', 6);

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const USDT = await ethers.getContractFactory('MockUSDT');
    usdt = await USDT.deploy();
    await usdt.waitForDeployment();

    const Escrow = await ethers.getContractFactory('PolyBet365Escrow');
    escrow = await Escrow.deploy(await usdt.getAddress());
    await escrow.waitForDeployment();

    // Give each test user 10 000 USDT
    for (const user of [alice, bob, carol]) {
      await usdt.connect(user).faucet();
      await usdt.connect(user).approve(await escrow.getAddress(), ethers.MaxUint256);
    }
  });

  // ─── MockUSDT ──────────────────────────────────────────────────────────────
  describe('MockUSDT', () => {
    it('has 6 decimals', async () => {
      expect(await usdt.decimals()).to.equal(6);
    });

    it('faucet mints 10 000 USDT', async () => {
      expect(await usdt.balanceOf(alice.address)).to.equal(FAUCET_AMT);
    });

    it('owner can mint', async () => {
      await usdt.mint(bob.address, SHARE_PRICE);
      expect(await usdt.balanceOf(bob.address)).to.equal(FAUCET_AMT + SHARE_PRICE);
    });

    it('non-owner cannot mint', async () => {
      await expect(usdt.connect(alice).mint(alice.address, SHARE_PRICE))
        .to.be.revertedWithCustomError(usdt, 'OwnableUnauthorizedAccount');
    });
  });

  // ─── Market creation ───────────────────────────────────────────────────────
  describe('createMarket', () => {
    it('owner can create a market', async () => {
      await expect(escrow.createMarket('Will BTC hit $100k?'))
        .to.emit(escrow, 'MarketCreated')
        .withArgs(0n, 'Will BTC hit $100k?');
      expect(await escrow.marketCount()).to.equal(1n);
    });

    it('non-owner cannot create a market', async () => {
      await expect(escrow.connect(alice).createMarket('test'))
        .to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
    });

    it('market starts open and with zero pools', async () => {
      await escrow.createMarket('test');
      const [, yesPool, noPool, outcome, closed] = await escrow.getMarket(0);
      expect(yesPool).to.equal(0n);
      expect(noPool).to.equal(0n);
      expect(outcome).to.equal(0);  // Open
      expect(closed).to.equal(false);
    });
  });

  // ─── Buy positions ─────────────────────────────────────────────────────────
  describe('buyPosition', () => {
    beforeEach(async () => { await escrow.createMarket('test'); });

    it('user can buy YES shares', async () => {
      await expect(escrow.connect(alice).buyPosition(0, true, 100n))
        .to.emit(escrow, 'PositionBought')
        .withArgs(0n, alice.address, true, 100n);

      const [, yesPool] = await escrow.getMarket(0);
      expect(yesPool).to.equal(SHARE_PRICE * 100n);

      const [yesShares] = await escrow.getPosition(0, alice.address);
      expect(yesShares).to.equal(100n);
    });

    it('user can buy NO shares', async () => {
      await escrow.connect(bob).buyPosition(0, false, 50n);
      const [,, noPool] = await escrow.getMarket(0);
      expect(noPool).to.equal(SHARE_PRICE * 50n);
    });

    it('transfers correct USDT from buyer', async () => {
      const before = await usdt.balanceOf(alice.address);
      await escrow.connect(alice).buyPosition(0, true, 10n);
      expect(await usdt.balanceOf(alice.address)).to.equal(before - SHARE_PRICE * 10n);
    });

    it('reverts on zero shares', async () => {
      await expect(escrow.connect(alice).buyPosition(0, true, 0n))
        .to.be.revertedWith('zero shares');
    });

    it('reverts on closed market', async () => {
      await escrow.closeMarket(0);
      await expect(escrow.connect(alice).buyPosition(0, true, 1n))
        .to.be.revertedWith('market not open');
    });
  });

  // ─── Close market ──────────────────────────────────────────────────────────
  describe('closeMarket', () => {
    beforeEach(async () => { await escrow.createMarket('test'); });

    it('owner can close', async () => {
      await expect(escrow.closeMarket(0)).to.emit(escrow, 'MarketClosed').withArgs(0n);
      const [,,,, closed] = await escrow.getMarket(0);
      expect(closed).to.be.true;
    });

    it('cannot close twice', async () => {
      await escrow.closeMarket(0);
      await expect(escrow.closeMarket(0)).to.be.revertedWith('already closed');
    });

    it('non-owner cannot close', async () => {
      await expect(escrow.connect(alice).closeMarket(0))
        .to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
    });
  });

  // ─── Resolve market ────────────────────────────────────────────────────────
  describe('resolveMarket', () => {
    beforeEach(async () => {
      await escrow.createMarket('test');
      await escrow.closeMarket(0);
    });

    it('resolves YES (outcome = 1)', async () => {
      await expect(escrow.resolveMarket(0, 1))
        .to.emit(escrow, 'MarketResolved').withArgs(0n, 1);
      const [,,, outcome] = await escrow.getMarket(0);
      expect(outcome).to.equal(1);
    });

    it('resolves NO (outcome = 2)', async () => {
      await escrow.resolveMarket(0, 2);
      const [,,, outcome] = await escrow.getMarket(0);
      expect(outcome).to.equal(2);
    });

    it('resolves Cancelled (outcome = 3)', async () => {
      await escrow.resolveMarket(0, 3);
      const [,,, outcome] = await escrow.getMarket(0);
      expect(outcome).to.equal(3);
    });

    it('cannot resolve before closing', async () => {
      await escrow.createMarket('test2');
      await expect(escrow.resolveMarket(1, 1)).to.be.revertedWith('must close first');
    });

    it('cannot resolve twice', async () => {
      await escrow.resolveMarket(0, 1);
      await expect(escrow.resolveMarket(0, 2)).to.be.revertedWith('already resolved');
    });

    it('rejects invalid outcome (0)', async () => {
      await expect(escrow.resolveMarket(0, 0)).to.be.revertedWith('bad outcome');
    });
  });

  // ─── Claim winnings ────────────────────────────────────────────────────────
  describe('claimWinnings', () => {
    beforeEach(async () => {
      await escrow.createMarket('test');
      await escrow.connect(alice).buyPosition(0, true,  100n); // YES winner
      await escrow.connect(bob).buyPosition(0, false, 50n);    // NO loser
      await escrow.closeMarket(0);
      await escrow.resolveMarket(0, 1); // YES wins
    });

    it('YES winner receives payout minus 2% fee', async () => {
      const before = await usdt.balanceOf(alice.address);
      await expect(escrow.connect(alice).claimWinnings(0))
        .to.emit(escrow, 'Claimed');

      const gross  = SHARE_PRICE * 100n;
      const fee    = (gross * FEE_BPS) / BPS_DENOM;
      const payout = gross - fee;

      expect(await usdt.balanceOf(alice.address)).to.equal(before + payout);
    });

    it('NO loser gets nothing', async () => {
      const before = await usdt.balanceOf(bob.address);
      await expect(escrow.connect(bob).claimWinnings(0))
        .to.be.revertedWith('no winning shares');
      expect(await usdt.balanceOf(bob.address)).to.equal(before);
    });

    it('cannot claim twice', async () => {
      await escrow.connect(alice).claimWinnings(0);
      await expect(escrow.connect(alice).claimWinnings(0))
        .to.be.revertedWith('already claimed');
    });

    it('cannot claim on unresolved market', async () => {
      await escrow.createMarket('open');
      await escrow.connect(alice).buyPosition(1, true, 1n);
      await expect(escrow.connect(alice).claimWinnings(1))
        .to.be.revertedWith('not resolved');
    });

    it('fee stays in contract (platform revenue)', async () => {
      const contractBefore = await usdt.balanceOf(await escrow.getAddress());
      await escrow.connect(alice).claimWinnings(0);
      const contractAfter = await usdt.balanceOf(await escrow.getAddress());

      const gross = SHARE_PRICE * 100n;
      const fee   = (gross * FEE_BPS) / BPS_DENOM;
      // bob's NO stake (50 USDT) + alice's fee remain in contract
      const bobStake = SHARE_PRICE * 50n;
      expect(contractAfter).to.equal(bobStake + fee);
    });
  });

  // ─── Claim refund ──────────────────────────────────────────────────────────
  describe('claimRefund', () => {
    beforeEach(async () => {
      await escrow.createMarket('test');
      await escrow.connect(alice).buyPosition(0, true, 60n);
      await escrow.connect(alice).buyPosition(0, false, 40n);
      await escrow.connect(bob).buyPosition(0, true, 20n);
      await escrow.closeMarket(0);
      await escrow.resolveMarket(0, 3); // Cancelled
    });

    it('user gets full stake back (no fee)', async () => {
      const before = await usdt.balanceOf(alice.address);
      await expect(escrow.connect(alice).claimRefund(0))
        .to.emit(escrow, 'Refunded')
        .withArgs(0n, alice.address, SHARE_PRICE * 100n);
      expect(await usdt.balanceOf(alice.address)).to.equal(before + SHARE_PRICE * 100n);
    });

    it('bob gets his stake back', async () => {
      const before = await usdt.balanceOf(bob.address);
      await escrow.connect(bob).claimRefund(0);
      expect(await usdt.balanceOf(bob.address)).to.equal(before + SHARE_PRICE * 20n);
    });

    it('cannot refund twice', async () => {
      await escrow.connect(alice).claimRefund(0);
      await expect(escrow.connect(alice).claimRefund(0))
        .to.be.revertedWith('already claimed');
    });

    it('cannot refund on non-cancelled market', async () => {
      await escrow.createMarket('resolved');
      await escrow.connect(alice).buyPosition(1, true, 1n);
      await escrow.closeMarket(1);
      await escrow.resolveMarket(1, 1);
      await expect(escrow.connect(alice).claimRefund(1))
        .to.be.revertedWith('not cancelled');
    });

    it('user with no position cannot refund', async () => {
      await expect(escrow.connect(carol).claimRefund(0))
        .to.be.revertedWith('nothing to refund');
    });
  });

  // ─── Pause / rescue ────────────────────────────────────────────────────────
  describe('pause & rescueTokens', () => {
    it('owner can pause and unpause', async () => {
      await escrow.pause();
      expect(await escrow.paused()).to.be.true;
      await escrow.unpause();
      expect(await escrow.paused()).to.be.false;
    });

    it('buyPosition blocked when paused', async () => {
      await escrow.createMarket('test');
      await escrow.pause();
      await expect(escrow.connect(alice).buyPosition(0, true, 1n))
        .to.be.revertedWithCustomError(escrow, 'EnforcedPause');
    });

    it('createMarket blocked when paused', async () => {
      await escrow.pause();
      await expect(escrow.createMarket('test'))
        .to.be.revertedWithCustomError(escrow, 'EnforcedPause');
    });

    it('owner can rescue tokens', async () => {
      // Accidentally send USDT directly to contract
      await usdt.connect(alice).transfer(await escrow.getAddress(), SHARE_PRICE * 5n);
      const before = await usdt.balanceOf(owner.address);
      await escrow.rescueTokens(await usdt.getAddress(), owner.address, SHARE_PRICE * 5n);
      expect(await usdt.balanceOf(owner.address)).to.equal(before + SHARE_PRICE * 5n);
    });
  });
});
