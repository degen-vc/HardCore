const UniswapV2Factory = artifacts.require('UniswapV2Factory')
const UniswapV2Router = artifacts.require('UniswapV2Router02')
const WETHUniswap = artifacts.require('WETH')
const MockERC20 = artifacts.require('MockERC20')

const FeeDistributor = artifacts.require("FeeDistributor")
const NFTFund = artifacts.require('NFTFund')
const LiquidVault = artifacts.require('LiquidVault')

const { BN } = require('bn.js')
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
  return web3.utils.toWei(String(x))
}

contract('FeeDistributor', ([ALICE, BOB, UNISWAP, HACKER]) => {
  let WETH,
    uniFactory,
    uniRouterV2,
    hardCoreToken,
    liquidVault,
    nftFund,
    feeDistributor;

  let liquidVaultShare=0,
    burnPercentage=0;

  before('Setup', async () => {
    WETH = await WETHUniswap.new("Wrapped ETH", "WETH", { from: UNISWAP });
    uniFactory = await UniswapV2Factory.new(UNISWAP, { from: UNISWAP });
    uniRouterV2 = await UniswapV2Router.new(uniFactory.address, WETH.address, { from: UNISWAP });

    // hardcore
    hardCoreToken = await MockERC20.new("Hardcore Token", "HRD", toWei('1000000').toString(), { from: ALICE });
    liquidVault = await LiquidVault.new({ from: ALICE });
    feeDistributor = await FeeDistributor.new({ from: ALICE });
    nftFund = await NFTFund.new(
      uniFactory.address,
      uniRouterV2.address,
      hardCoreToken.address,
      feeDistributor.address,
      {from: ALICE}
    );

    this.snapshotId = await takeSnapshot();
  });

  // afterEach('revert', async () => {
  //   await revertToSnapshot(this.snapshotId);
  // });

  describe('All', () => {
    afterEach('revert', async () => {
      await revertToSnapshot(this.snapshotId);
    });

    it('Should set seed successfully', async () => {
      await feeDistributor.seed(
          hardCoreToken.address,
          liquidVault.address,
          nftFund.address,
          liquidVaultShare,
          burnPercentage,
          { from: ALICE }
        );
    });

    it('Should set seed with fail', async () => {
      await expectRevert(
        feeDistributor.seed(
          hardCoreToken.address,
          liquidVault.address,
          nftFund.address,
          liquidVaultShare,
          burnPercentage,
          { from: HACKER }
        ),
        "Ownable: caller is not the owner"
      );
    });

    it('Should not distribute tokens without configurations', async () => {
      await expectRevert(
        feeDistributor.distributeFees({from: BOB}),
        "HARDCORE: Fees cannot be distributed until Distributor seeded."
      );
      await expectRevert(
        feeDistributor.distributeFees({ from: ALICE }),
        "HARDCORE: Fees cannot be distributed until Distributor seeded."
      );
    });

    it('Should not distribute tokens with low balance', async () => {
      await feeDistributor.seed(
        hardCoreToken.address,
        liquidVault.address,
        nftFund.address,
        liquidVaultShare,
        burnPercentage,
        { from: ALICE }
      );

      await expectRevert(
        feeDistributor.distributeFees({ from: BOB }),
        "HARDCORE: low token balance"
      );

      await expectRevert(
        feeDistributor.distributeFees({ from: ALICE }),
        "HARDCORE: low token balance"
      );
    })

    it('Should distribute tokens', async () => {
      liquidVaultShare=30;
      burnPercentage=15;

      let contractBalance = toBn(toWei('100'));

      await feeDistributor.seed(
        hardCoreToken.address,
        liquidVault.address,
        nftFund.address,
        liquidVaultShare,
        burnPercentage,
        { from: ALICE }
      );

      await hardCoreToken.transfer(feeDistributor.address, contractBalance.toString(), { from: ALICE });

      const totalSupplyBefore = await hardCoreToken.totalSupply();

      await feeDistributor.distributeFees({ from: ALICE });

      let burnedBalance = contractBalance.div(toBn(100)).mul(toBn(burnPercentage));

      assert.equal((await hardCoreToken.totalSupply()).toString(), totalSupplyBefore.sub(burnedBalance).toString(), "Balance the same");
      assert.equal((await hardCoreToken.balanceOf(feeDistributor.address)).toString(), 0, "Balance positive");
      assert.equal((await hardCoreToken.balanceOf(
        liquidVault.address)).toString(),
        contractBalance.div(toBn(100)).mul(toBn(liquidVaultShare)),
        "Not equal"
      );

    });

  });
})