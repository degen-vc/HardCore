
const MockERC20 = artifacts.require('MockERC20')

const FeeDistributor = artifacts.require("FeeDistributor")
const NFTFund = artifacts.require('NFTFund')
const LiquidVault = artifacts.require('LiquidVault')

const deployUniswap = require('./helpers/deployUniswap')

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

contract('FeeDistributor', accounts => {
  const [ALICE, BOB, UNISWAP, HACKER] = accounts;
  let hardCoreToken, liquidVault, nftFund, feeDistributor;

  let uniswapPairAddress
  let uniswapFactory
  let uniswapRouter

  let liquidVaultShare=0,
    burnPercentage=0;

  before('Setup', async () => {
    const contracts = await deployUniswap(accounts);
    uniswapFactory = contracts.uniswapFactory;
    uniswapRouter = contracts.uniswapRouter;
    wethInstance = contracts.weth;

    // hardcore
    hardCoreToken = await MockERC20.new("Hardcore Token", "HRD", toWei('1000000').toString(), { from: ALICE });
    liquidVault = await LiquidVault.new({ from: ALICE });
    feeDistributor = await FeeDistributor.new({ from: ALICE });
    nftFund = await NFTFund.new(
      uniswapRouter.address,
      hardCoreToken.address,
      {from: ALICE}
    );

    this.snapshotId = await takeSnapshot();
  });

  afterEach('revert', async () => {
    await revertToSnapshot(this.snapshotId);
  });

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