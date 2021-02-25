const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers")
const deployUniswap = require('./helpers/deployUniswap')
const async = require('./helpers/async.js')
const expectThrow = require('./helpers/expectThrow').handle
const time = require('./helpers/time')
const test = async.test
const setup = async.setup
const hardcore = artifacts.require("HardCore")
const distributor = artifacts.require("FeeDistributor")
const feeApprover = artifacts.require("FeeApprover")
const liquidVault = artifacts.require("LiquidVault")
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair');
const PriceOracle = artifacts.require('PriceOracle');


const bn = (input) => web3.utils.toBN(input)
const assertBNequal = (bnOne, bnTwo) => assert.equal(bnOne.toString(), bnTwo.toString())

let primary = ""
contract('liquid vault', accounts => {
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const [ owner, nonOwner, lpHolder, ethReceiver, lpHolder2 ] = accounts
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
    const baseUnit = bn('1000000000000000000');
    const startTime = Math.floor(Date.now() / 1000);

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async () => {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new()
        feeApproverInstance = await feeApprover.new()
        distributorInstance = await distributor.new()

        await hardcoreInstance.initialSetup(feeApproverInstance.address, distributorInstance.address, liquidVaultInstance.address)
        await hardcoreInstance.createUniswapPair(uniswapFactory.address)
        await distributorInstance.seed(hardcoreInstance.address, liquidVaultInstance.address, ethReceiver, 40, 1)

        uniswapPair = await hardcoreInstance.tokenUniswapPair()
        uniswapOracle = await PriceOracle.new(uniswapPair, hardcoreInstance.address, wethInstance.address);

        await feeApproverInstance.initialize(uniswapPair, liquidVaultInstance.address)
        await feeApproverInstance.unPause()
        await feeApproverInstance.setFeeMultiplier(10)
        await liquidVaultInstance.seed(0, hardcoreInstance.address, distributorInstance.address, ethReceiver, 10, 10, uniswapOracle.address)
        primary = accounts[0]

        const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair);
        const liquidityTokensAmount = bn('1000').mul(baseUnit); // 1.000 tokens
        const liquidityEtherAmount = bn('10').mul(baseUnit); // 10 ETH

        await hardcoreInstance.approve(uniswapRouter.address, liquidityTokensAmount);

        await uniswapRouter.addLiquidityETH(
            hardcoreInstance.address,
            liquidityTokensAmount,
            0,
            0,
            owner,
            new Date().getTime() + 3000,
            {value: liquidityEtherAmount}
        );
    })

    test('manual batch insertion fails for non-owner', async () => {
      const lpAmount = bn('10').mul(baseUnit)
      await expectRevert(
        liquidVaultInstance.insertUnclaimedBatchFor(lpHolder, lpAmount, startTime, {from: nonOwner}),
        'Ownable: caller is not the owner'
      )
    })

    test('manual batch insertion fails if zero LP amount provided', async () => {
      const lpAmount = 0
      await expectRevert(
        liquidVaultInstance.insertUnclaimedBatchFor(lpHolder, lpAmount, startTime),
        'HARDCORE: LP amount should not be zero.'
      )
    })

    test('manual batch insertion increases holder\'s locked lp length by 1', async () => {
      const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair)
      const lpAmount = bn('20').mul(baseUnit)
      const holdersLpAmount = bn('5').mul(baseUnit)

      //transfer the necessary LP amount to the new liquid vault first
      await lpTokenInstance.transfer(liquidVaultInstance.address, lpAmount)

      const liquidVaultsBalance = await lpTokenInstance.balanceOf(liquidVaultInstance.address)
      assertBNequal(liquidVaultsBalance, lpAmount)
      assert.equal(await liquidVaultInstance.batchInsertionAllowed(), true)

      //insert a batch to assign LP amount for a holder
      await liquidVaultInstance.insertUnclaimedBatchFor(lpHolder, holdersLpAmount, startTime)

      const lpLength = await liquidVaultInstance.lockedLPLength(lpHolder)
      assertBNequal(lpLength, 1)
      
      const { holder, amount, timestamp } = await liquidVaultInstance.LockedLP(lpHolder, 0)
      assertBNequal(amount, holdersLpAmount)
      assertBNequal(startTime, timestamp)
      assert.equal(holder, lpHolder)
    })

    test('manual batch insertion performed along with the regular purchaseLP', async () => {
      const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair)
      const holdersLpAmount = bn('4').mul(baseUnit)

      const lpLengthBefore = await liquidVaultInstance.lockedLPLength(lpHolder2)
      assertBNequal(lpLengthBefore, 0)
      
      await liquidVaultInstance.insertUnclaimedBatchFor(lpHolder2, holdersLpAmount, startTime)
      const lpLengthAfter = await liquidVaultInstance.lockedLPLength(lpHolder2)
      assertBNequal(lpLengthAfter, 1)

      await hardcoreInstance.transfer(liquidVaultInstance.address, '1000000000000000000000')
      const purchase = await liquidVaultInstance.purchaseLP({ value: bn('1').mul(baseUnit), from: lpHolder2 })
      const lpLengthAfter2 = await liquidVaultInstance.lockedLPLength(lpHolder2)
      assertBNequal(lpLengthAfter2, 2)

      const { holder, amount, timestamp } = await liquidVaultInstance.LockedLP(lpHolder2, 1)
      assertBNequal(amount, bn('7684334714209161776'))
      assertBNequal(purchase.receipt.logs[0].args[4], timestamp)
      assert.equal(holder, lpHolder2)
    })

    test('all batches are claimed by lpHolder2 in the correct order', async () => {
      const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair)
      const holdersLpAmount = bn('4').mul(baseUnit)
      const holdersLpAmountSecond = bn('7684334714209161776')

      const lpLength = await liquidVaultInstance.lockedLPLength(lpHolder2)
      assertBNequal(lpLength, 2)

      const { holder: firstBatchHolder, amount: firstBatchAmount } = await liquidVaultInstance.LockedLP(lpHolder2, 0)
      assertBNequal(firstBatchAmount, holdersLpAmount)
      assert.equal(firstBatchHolder, lpHolder2)

      const { holder: secondBatchHolder, amount: secondBatchAmount } = await liquidVaultInstance.LockedLP(lpHolder2, 1)
      assertBNequal(secondBatchAmount, holdersLpAmountSecond)
      assert.equal(secondBatchHolder, lpHolder2)

      const firstClaim = await liquidVaultInstance.claimLP({ from: lpHolder2 })
      const lpBalanceAfterFirstClaim = await lpTokenInstance.balanceOf(lpHolder2)
      const exitFeeFirst = firstClaim.receipt.logs[0].args[3]
      const expectedBalanceAfterFirst = holdersLpAmount.sub(exitFeeFirst)

      assert.equal(firstClaim.receipt.logs[0].args[0], lpHolder2)
      assertBNequal(firstClaim.receipt.logs[0].args[1], holdersLpAmount)
      assertBNequal(lpBalanceAfterFirstClaim, expectedBalanceAfterFirst)

      await time.advanceTime(1)

      const secondClaim = await liquidVaultInstance.claimLP({ from: lpHolder2 })
      const lpBalanceAfterSecondClaim = await lpTokenInstance.balanceOf(lpHolder2)
      const exitFeeSecond = secondClaim.receipt.logs[0].args[3]
      const expectedBalanceAfterSecond = expectedBalanceAfterFirst.add(holdersLpAmountSecond.sub(exitFeeSecond))

      assert.equal(secondClaim.receipt.logs[0].args[0], lpHolder2)
      assertBNequal(secondClaim.receipt.logs[0].args[1], holdersLpAmountSecond)
      assertBNequal(lpBalanceAfterSecondClaim, expectedBalanceAfterSecond)
    })

    //TODO: test case for nothing to claim

    test('manual batch insertion disabling fails for non-owner', async () => {
      await expectRevert(
        liquidVaultInstance.disableManualBatchInsertion({ from: nonOwner }),
        'Ownable: caller is not the owner'
      )
    })

    test('manual batch insertion disabling doesn\'t allow to call insertUnclaimedBatchFor() anymore', async () => {
      const holdersLpAmount = bn('5').mul(baseUnit)

      assert.equal(await liquidVaultInstance.batchInsertionAllowed(), true)
      await liquidVaultInstance.disableManualBatchInsertion()
      assert.equal(await liquidVaultInstance.batchInsertionAllowed(), false)

      await expectRevert(
        liquidVaultInstance.insertUnclaimedBatchFor(lpHolder, holdersLpAmount, startTime),
        'HARDCORE: Manual batch insertion is no longer allowed.'
      )
    })
})