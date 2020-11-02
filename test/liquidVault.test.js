
const async = require('./helpers/async.js')
const expectThrow = require('./helpers/expectThrow').handle
const time = require('./helpers/time')
const test = async.test
const setup = async.setup
const hardcore = artifacts.require("HardCore")
const distributor = artifacts.require("FeeDistributor")
const feeApprover = artifacts.require("FeeApprover")
const liquidVault = artifacts.require("LiquidVault")
const uniswapPairABI = artifacts.require('UniswapV2Pair').abi

let primary = ""
contract('liquid vault', accounts => {
    var hardcoreInstance, liquidVaultInstance, feeAproverInstance, distributorInstance
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }

    setup(async () => {
        hardcoreInstance = await hardcore.deployed()
        liquidVaultInstance = await liquidVault.deployed()
        feeAproverInstance = await feeApprover.deployed()
        distributorInstance = await distributor.deployed()
        await feeAproverInstance.unPause()
        primary = accounts[0]
        await hardcoreInstance.transfer(distributorInstance.address, "25000000000")
    })

    test("purchaseLP with no eth fails", async () => {
        await expectThrow(liquidVaultInstance.purchaseLP({ value: '0' }), 'HARDCORE: eth required to mint Hardcore LP')
    })

    test('sending eth on purchase increases queue size by 1', async () => {

        const lengthBefore = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        await liquidVaultInstance.purchaseLP({ value: '100000000000' })
        const lengthAfter = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()

        assert.equal(lengthAfter - lengthBefore, 1)

        const lp = await liquidVaultInstance.getLockedLP.call(accounts[0], lengthAfter - 1)
        const sender = lp[0].toString()
        const amount = lp[1].toNumber()
        const timestamp = lp[2].toNumber()
        assert.equal(sender, accounts[0])
        assert.isAbove(amount, 0)
        assert.isAbove(timestamp, 0)

        await hardcoreInstance.transfer(distributorInstance.address, "1000000000")
        await liquidVaultInstance.purchaseLP({ value: '7000000' })

        const lengthAfterSecondPurchase = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterSecondPurchase - lengthAfter, 1)

        const lp2 = await liquidVaultInstance.getLockedLP.call(accounts[0], lengthAfterSecondPurchase - 1)

        const sender2 = lp2[0].toString()
        const amount2 = lp2[1].toNumber()
        const timestamp2 = lp2[2].toNumber()
        assert.equal(sender2, accounts[0])
        assert.isAbove(amount2, 0)
        assert.isAbove(timestamp2, 0)

        await expectThrow(liquidVaultInstance.purchaseLP({ value: '250000000000' }), "HARDCORE: insufficient HardCore in LiquidVault")

        await expectThrow(liquidVaultInstance.claimLP({ from: accounts[3] }), "HARDCORE: No locked LP.")

        await expectThrow(liquidVaultInstance.claimLP(), "HARDCORE: LP still locked.")

        await time.advanceTime(172801) //just over 2 days

        const lpAddress = (await hardcoreInstance.tokenUniswapPair.call()).toString()
        console.log('LPADDRESS: ' + lpAddress)
        const lpTokenInstance = (await new web3.eth.Contract(uniswapPairABI, lpAddress))

        const lpBalaceBefore = parseInt((await lpTokenInstance.methods.balanceOf(accounts[0]).call({ from: primary })).toString())
        assert.equal(lpBalaceBefore, 0)

        const donationLPBeforeFirst = parseInt((await lpTokenInstance.methods.balanceOf(accounts[3]).call({ from: primary })).toString())

        await liquidVaultInstance.claimLP()

        const donationLPAfterFirst = parseInt((await lpTokenInstance.methods.balanceOf(accounts[3]).call({ from: primary })).toString())

        const lengthAfterClaim = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterClaim, lengthAfterSecondPurchase - 1)
        const lpBalaceAfterClaim = parseInt((await lpTokenInstance.methods.balanceOf(accounts[0]).call({ from: primary })).toString())

        assert.equal(lpBalaceAfterClaim, amount2 * 0.9) //donation tax

        assert.equal(donationLPAfterFirst - donationLPBeforeFirst, amount2 * 0.1)


        await liquidVaultInstance.claimLP()

        const donationLPAfterSecond = parseInt((await lpTokenInstance.methods.balanceOf(accounts[3]).call({ from: primary })).toString())

        const lengthAfterSecondClaim = (await liquidVaultInstance.lockedLPLength.call(accounts[0])).toNumber()
        assert.equal(lengthAfterSecondClaim, lengthAfterClaim - 1)
        const lpBalaceAfterSecondClaim = parseInt((await lpTokenInstance.methods.balanceOf(accounts[0]).call({ from: primary })).toString())

        assert.equal(lpBalaceAfterSecondClaim, lpBalaceAfterClaim + (amount * 0.9)) //donation tax

        assert.equal(donationLPAfterSecond - donationLPAfterFirst, amount * 0.1)

    })

    test("transferGrab sends tokens while increasing LP balance", async () => {
        const lpAddress = (await hardcoreInstance.tokenUniswapPair.call()).toString()
        console.log('LPADDRESS: ' + lpAddress)
        const lpTokenInstance = (await new web3.eth.Contract(uniswapPairABI, lpAddress))

        await hardcoreInstance.transfer(distributorInstance.address, "100000000000")

        await hardcoreInstance.transfer(accounts[4], "25000000000")

        const lockedLengthBefore= (await liquidVaultInstance.lockedLPLength.call(accounts[4])).toNumber()
        assert.equal(lockedLengthBefore,0)
       
        await hardcoreInstance.transferGrabLP(accounts[5], '10000000', { from: accounts[4], value: 20000 })

        const balanceOf5 = (await hardcoreInstance.balanceOf.call(accounts[5])).toString()
        assert.equal(balanceOf5, "9000000")

        const lockedLPLengthAfter= (await liquidVaultInstance.lockedLPLength.call(accounts[4])).toNumber()
        assert.equal(lockedLPLengthAfter,1)

        const lp = await liquidVaultInstance.getLockedLP.call(accounts[4], 0)
        const sender = lp[0].toString()
        const amount = lp[1].toNumber()
        const timestamp = lp[2].toNumber()

        assert.equal(sender,accounts[4])
        assert.isAbove(amount,0)
    })

})
