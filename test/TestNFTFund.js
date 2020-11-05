const { BN } = require('bn.js')

const UniswapV2Pair = artifacts.require('UniswapV2Pair')
const UniswapV2Factory = artifacts.require('UniswapV2Factory')
const UniswapV2Router = artifacts.require('UniswapV2Router02')
const WETHUniswap = artifacts.require('WETH')

const MockERC20 = artifacts.require('MockERC20')

const NFTFund = artifacts.require('NFTFund')

const {
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");

const {
  takeSnapshot,
  revertToSnapshot,
  timeTravelTo,
  timeTravelToDate,
  timeTravelToBlock,
  expandTo18Decimals
} = require("./helpers/helper");

function toBn(x) {
  return new BN(x)
}

function toWei(x) {
  return web3.utils.toWei(x)
}

contract('NFTFund', ([ALICE, BOB, DISTRIBUTOR, UNISWAP, HACKER, UNTRUSTED]) => {

  let WETH, uniFactory, uniRouterV2, hardCoreToken, nftFund

  before('Setup', async () => {
    WETH = await WETHUniswap.new("Wrapped ETH", "WETH", toWei(1000000), { from: UNISWAP });

    uniFactory = await UniswapV2Factory.new(3, { from: UNISWAP });
    uniRouterV2 = await UniswapV2Router.new(uniFactory.address, WETH.address, { from: UNISWAP })

    hardCoreToken = await MockERC20.new("Hardcore Token", "HRD", toWei(1000000), { from: DISTRIBUTOR })

    nftFund = await NFTFund.new(
      uniFactory.address,
      uniRouterV2.address,
      hardCoreToken.address,
      DISTRIBUTOR,
      {from: ALICE}
    );

    this.snapshotId = await takeSnapshot();
  });

  afterEach('revert', async () => {
    await revertToSnapshot(this.snapshotId);
  });

  describe('Deposit', () => {
    it('Should fail, if called from not distributor', async () => {
      await expectRevert(nftFund.deposit(
        toWei(1), { from: HACKER, value: toWei(1) }),
        "NFTFund: Only distributor"
      );
      await expectRevert(nftFund.deposit(
        toWei(1), { from: ALICE, value: toWei(1) }),
        "NFTFund: Only distributor"
      );
    });

    it('Should be deposited', async () => {
        let amount = toWei(1);
        let balanceHardCoreTokenBefore = await hardCoreToken.balanceOf(nftFund.address);
        let result = await nftFund.deposit(amount, { from: DISTRIBUTOR, value: toWei(1) });

        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'Deposited');
        assert.equal(result.logs[0].from, DISTRIBUTOR);
        assert.equal(result.logs[0].amount.toString(), amount.toString());

        assert.equal(
          (await hardCoreToken.balanceOf(nftFund.address)).toString(),
          balanceHardCoreTokenBefore.add(amount).toString(),
          "Balance changed not correct"
        );
    });
  });

  describe('Sell', () => {
    it('Should fail is sell all token balance to WETH', async () => {
      await expectRevert(nftFund.sell({ from: DISTRIBUTOR }), "xxxx");
    });

    it('Should successfully sell all token balance to WETH', async () => {
      let hardCoreBalance = await hardCoreToken.balanceOf(nftFund.address);
      let balanceWETHBefore = await WETH.balanceOf(nftFund.address);

      let result = await nftFund.sell({ from: ALICE });

      let balanceWETHAfter = await WETH.balanceOf(nftFund.address);

      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'Trade');
      assert.equal(result.logs[0].tokens.toString(), hardCoreBalance.toString());
      assert.equal(
        result.logs[0].toWeth.toString(),
        balanceWETHAfter.sub(balanceWETHBefore).toString()
      );
    });

    it('Should successfully sell limited token balance to WETH', async () => {
      let amount = toWei(1)
      await nftFund.sell(amount, { from: ALICE });
    });
  });

  describe('Withdraw', () => {
    beforeEach('Setup', async () => {
      // add balance to DISTRIBUTOR
      await WETH.deposit({ value: toWei(1), from: DISTRIBUTOR });
      // transfer balance to nftFund
      await WETH.transfer(nftFund.address, toWei(1), { from: DISTRIBUTOR });
    })

    it('Should unsuccessfully withdraw token to the account, if no owner', async () => {
      await expectRevert(nftFund.withdrawToken({from: HACKER}),"Ownable: caller is not the owner");
      await expectRevert(nftFund.withdrawToken({from: UNTRUSTED}),"Ownable: caller is not the owner");
      await expectRevert(nftFund.withdrawToken({from: DISTRIBUTOR}),"Ownable: caller is not the owner");
      await expectRevert(nftFund.withdrawToken({from: UNISWAP}),"Ownable: caller is not the owner");
    });

    it('Should successfully withdraw token to the account', async () => {
      let wethBalance = await WETH.balanceOf(nftFund.address);
      let result = await nftFund.withdrawToken(WETH.address, {from: ALICE});

      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[1].event, 'Withdrawn');
      assert.equal(result.logs[1].token, WETH.address);
      assert.equal(result.logs[1].to, await nftFund.owner());
      assert.equal(result.logs[1].amount.toString(), wethBalance.toString());
    });

    it('Should successfully withdraw token to the specific account with some amount', async () => {
      let balanceWETHBefore = await WETH.balanceOf(nftFund.address);

      let amount = toWei(1).div(2).toString();
      let result = await nftFund.withdrawToken(WETH.address, BOB, amount, {from: ALICE});

      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[1].event, 'Withdrawn');
      assert.equal(result.logs[1].token, WETH.address);
      assert.equal(result.logs[1].to, await nftFund.owner());
      assert.equal(result.logs[1].amount.toString(), balanceWETHBefore.toString());

      assert.equal(
        (await WETH.balanceOf(nftFund.address)).toString(),
        (await WETH.balanceOf(nftFund.address)).sub(amount).toString(),
        "Its just a transfer"
      );
    });
  });
})