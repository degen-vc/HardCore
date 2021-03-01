
const { expectEvent } = require("@openzeppelin/test-helpers")
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


function toBn(input) {
    return web3.utils.toBN(input)
}

let primary = ""
contract('liquid vault', accounts => {
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
        await distributorInstance.seed(hardcoreInstance.address, liquidVaultInstance.address, accounts[7], 40, 1)

        uniswapPair = await hardcoreInstance.tokenUniswapPair()
        uniswapOracle = await PriceOracle.new(uniswapPair, hardcoreInstance.address, wethInstance.address);

        await feeApproverInstance.initialize(uniswapPair, liquidVaultInstance.address)
        await feeApproverInstance.unPause()
        await feeApproverInstance.setFeeMultiplier(10)
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address)
        primary = accounts[0]
        await hardcoreInstance.transfer(distributorInstance.address, '25000000000')
    })

    test("purchaseLP with no eth fails", async () => {
        await expectThrow(liquidVaultInstance.purchaseLP({ value: '0' }), 'HARDCORE: eth required to mint Hardcore LP')
    })

    test('setParameters from non-owner fails', async () => {
        await expectThrow(liquidVaultInstance.setParameters(2, 10, 5, { from: accounts[3] }), 'Ownable: caller is not the owner')
    })

    test('setEthFeeAddress with zero addresses fails', async () => {
        await expectThrow(liquidVaultInstance.setEthFeeAddress(ZERO_ADDRESS), 'LiquidVault: eth receiver is zero address')
    })

    test('sending eth on purchase increases queue size by 1', async () => {
        await hardcoreInstance.transfer(liquidVaultInstance.address, '1000000000000000000000')

        const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair);
        const liquidityTokensAmount = '1000000000000000000000'; // 1.000 tokens
        const liquidityEtherAmount = '10000000000000000000'; // 10 ETH

        await hardcoreInstance.approve(uniswapRouter.address, liquidityTokensAmount);

        await uniswapRouter.addLiquidityETH(
            hardcoreInstance.address,
            liquidityTokensAmount,
            0,
            0,
            accounts[7],
            new Date().getTime() + 3000,
            { value: liquidityEtherAmount }
        );

        await liquidVaultInstance.setEthFeeAddress(accounts[1])
        const lengthBefore = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        const ethReceiverBalanceBefore = await web3.eth.getBalance(accounts[1])

        const liquidVaultHcoreBalance = await hardcoreInstance.balanceOf(liquidVaultInstance.address)
        const purchase = await liquidVaultInstance.purchaseLP({ value: '100000000000' })
        const ethReceiverBalanceAfter = await web3.eth.getBalance(accounts[1])
        const feeAmount = purchase.receipt.logs[1].args[3].toString()
        const ethForPurchase = purchase.receipt.logs[1].args[2].toString()
        const lengthAfter = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        const expectedFeeAmount = '10000000000'

        assert.equal(feeAmount, expectedFeeAmount)
        assert.equal(ethForPurchase, '90000000000')
        assert.equal(lengthAfter - lengthBefore, 1)
        assert.equal(toBn(ethReceiverBalanceBefore).add(toBn(expectedFeeAmount)).toString(), ethReceiverBalanceAfter)

        const lp = await liquidVaultInstance.getLockedLP.call(accounts[0], lengthAfter - 1)
        const sender = lp[0].toString()
        const amount = lp[1].toNumber()
        const timestamp = lp[2].toNumber()
        assert.equal(sender, accounts[0])
        assert.isAbove(amount, 0)
        assert.isAbove(timestamp, 0)

        await hardcoreInstance.transfer(distributorInstance.address, "1000000000")
        await liquidVaultInstance.purchaseLP({ value: '7000000' })
        const purchase2 = await liquidVaultInstance.purchaseLP({ value: '100000000', from: accounts[2] })
        const lengthAfterSecondPurchase = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterSecondPurchase - lengthAfter, 1)

        const lp2 = await liquidVaultInstance.getLockedLP.call(accounts[0], lengthAfterSecondPurchase - 1)

        const sender2 = lp2[0].toString()
        const amount2 = lp2[1].toNumber()
        const timestamp2 = lp2[2].toNumber()
        assert.equal(sender2, accounts[0])
        assert.isAbove(amount2, 0)
        assert.isAbove(timestamp2, 0)

        await expectThrow(liquidVaultInstance.purchaseLP({ value: '20000000000000000000' }), "HARDCORE: insufficient HardCore in LiquidVault")

        await expectThrow(liquidVaultInstance.claimLP({ from: accounts[3] }), "HARDCORE: No locked LP.")

        await expectThrow(liquidVaultInstance.claimLP(), "HARDCORE: LP still locked.")

        await time.advanceTime(172801) //just over 2 days

        const lpBalaceBefore = parseInt((await lpTokenInstance.balanceOf(accounts[0])).toString())
        assert.equal(lpBalaceBefore, 0)

        const length = Number(await liquidVaultInstance.lockedLPLength.call(accounts[0]))
        const lockedLP = await liquidVaultInstance.getLockedLP.call(accounts[0], 0)

        const amountToClaim = Number(lockedLP[1])

        const claim = await liquidVaultInstance.claimLP()
        const claimedAmount = Number(claim.receipt.logs[0].args[1])

        const expectedFee = parseInt((10 * amountToClaim) / 100)
        const exitFee = Number(claim.receipt.logs[0].args[3])

        expectEvent.inTransaction(claim.tx, lpTokenInstance, 'Transfer', {
            from: liquidVaultInstance.address,
            to: ZERO_ADDRESS,
            value: exitFee.toString()
        })

        const lengthAfterClaim = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterClaim, lengthAfterSecondPurchase)
        const lpBalanceAfterClaim = parseInt((await lpTokenInstance.balanceOf(accounts[0])).toString())

        assert.equal(amountToClaim, claimedAmount)
        assert.equal(expectedFee, exitFee)
        assert.equal(lpBalanceAfterClaim, claimedAmount - exitFee)

        const length2 = Number(await liquidVaultInstance.lockedLPLength.call(accounts[0]))
        const lockedLP2 = await liquidVaultInstance.getLockedLP.call(accounts[0], length2 - 1)
        const amountToClaim2 = Number(lockedLP2[1])

        const claim2 = await liquidVaultInstance.claimLP()
        const claimedAmount2 = Number(claim2.receipt.logs[0].args[1])

        const expectedFee2 = parseInt((10 * amountToClaim2) / 100)
        const exitFee2 = Number(claim2.receipt.logs[0].args[3])

        expectEvent.inTransaction(claim2.tx, lpTokenInstance, 'Transfer', {
            from: liquidVaultInstance.address,
            to: ZERO_ADDRESS,
            value: exitFee2.toString()
        })

        const lengthAfterSecondClaim = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterSecondClaim, lengthAfterClaim)
        const lpBalaceAfterSecondClaim = parseInt((await lpTokenInstance.balanceOf(accounts[0])).toString())

        assert.equal(amountToClaim2, claimedAmount2)
        assert.equal(expectedFee2, exitFee2)
        assert.equal(lpBalaceAfterSecondClaim, lpBalanceAfterClaim + (claimedAmount2 - exitFee2))

        await expectThrow(liquidVaultInstance.claimLP(), "HARDCORE: nothing to claim")

        await hardcoreInstance.transfer(distributorInstance.address, "1000000000")
        await liquidVaultInstance.purchaseLP({ value: '7000000' }) //purchase3

        await time.advanceTime(1728010) //just over 2 days

        const length3 = Number(await liquidVaultInstance.lockedLPLength.call(accounts[0]))
        const lockedLP3 = await liquidVaultInstance.getLockedLP.call(accounts[0], length3 - 1)
        const amountToClaim3 = Number(lockedLP3[1])

        const claim3 = await liquidVaultInstance.claimLP()
        const claimedAmount3 = Number(claim3.receipt.logs[0].args[1])

        const expectedFee3 = parseInt((10 * amountToClaim3) / 100)
        const exitFee3 = Number(claim3.receipt.logs[0].args[3])

        expectEvent.inTransaction(claim3.tx, lpTokenInstance, 'Transfer', {
            from: liquidVaultInstance.address,
            to: ZERO_ADDRESS,
            value: exitFee3.toString()
        })

        const lengthAfterThirdClaim = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterThirdClaim, lengthAfterSecondClaim + 1)
        const lpBalaceAfterThirdClaim = parseInt((await lpTokenInstance.balanceOf(accounts[0])).toString())

        assert.equal(amountToClaim3, claimedAmount3)
        assert.equal(expectedFee3, exitFee3)
        assert.equal(lpBalaceAfterThirdClaim, lpBalaceAfterSecondClaim + (claimedAmount3 - exitFee3))
    })

    test("transferGrab sends tokens while increasing LP balance", async () => {
        const lpAddress = (await hardcoreInstance.tokenUniswapPair.call()).toString()
        console.log('LPADDRESS: ' + lpAddress)
        const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair);

        await hardcoreInstance.transfer(distributorInstance.address, "100000000000")

        await hardcoreInstance.transfer(accounts[4], "25000000000")

        const lockedLengthBefore = (await liquidVaultInstance.lockedLPLength.call(accounts[4])).toNumber()
        assert.equal(lockedLengthBefore, 0)

        await hardcoreInstance.transferGrabLP(accounts[5], '10000000', { from: accounts[4], value: 20000 })

        const balanceOf5 = (await hardcoreInstance.balanceOf.call(accounts[5])).toString()
        assert.equal(balanceOf5, "9000000")

        const lockedLPLengthAfter = (await liquidVaultInstance.lockedLPLength.call(accounts[4])).toNumber()
        assert.equal(lockedLPLengthAfter, 1)

        const lp = await liquidVaultInstance.getLockedLP.call(accounts[4], 0)
        const sender = lp[0].toString()
        const amount = lp[1].toNumber()
        const timestamp = lp[2].toNumber()

        assert.equal(sender, accounts[4])
        assert.isAbove(amount, 0)
    })

})
