
const async = require('./helpers/async.js')
const expectThrow = require('./helpers/expectThrow').handle
const deployUniswap = require('./helpers/deployUniswap')
const test = async.test
const setup = async.setup
const hardcore = artifacts.require("HardCore")
const distributor = artifacts.require("FeeDistributor")
const feeApprover = artifacts.require("FeeApprover")
const liquidVault = artifacts.require("LiquidVault")
let primary = ""

contract('hardcore', accounts => {
	var hardcoreInstance, feeApproverInstance, distributorInstance
	const primaryOptions = { from: accounts[0], gas: "0x6091b7" }

	let uniswapPairAddress
	let uniswapFactory
	let uniswapRouter
	let wethInstance
	let uniswapOracle

	setup(async () => {
		primary = accounts[0]
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
		const uniswapPair = await hardcoreInstance.tokenUniswapPair();
		await feeApproverInstance.initialize(uniswapPair, liquidVaultInstance.address)
		await distributorInstance.seed(hardcoreInstance.address, liquidVaultInstance.address, accounts[7], 40, 1)
	})

	test("transfer while paused fails", async () => {
		await expectThrow(hardcoreInstance.transfer(accounts[2], "1000", { from: primary }), 'HARDCORE: system not yet initialized')
	})

	test("trading exacts a standard fee", async () => {
		await feeApproverInstance.unPause()
		await feeApproverInstance.setFeeMultiplier(10)
		const feeDistributorBalanceBefore = (await hardcoreInstance.balanceOf(distributorInstance.address)).toNumber()

		const feePercentage = (await feeApproverInstance.feePercentX100.call()).toNumber()
		assert.equal(feePercentage, 10)
		const receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[2])).toNumber()

		hardcoreInstance.transfer(accounts[2], "100000", { from: primary })
		const receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[2])).toNumber()
		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 90000)
		const feeDistributorBalanceAfter = (await hardcoreInstance.balanceOf(distributorInstance.address)).toNumber()
		assert.equal(feeDistributorBalanceAfter - feeDistributorBalanceBefore, 10000)
	})

	test("transfer to a toDiscount account reduces fee while from does not", async () => {
		await feeApproverInstance.unPause()
		await feeApproverInstance.setFeeMultiplier(10)
		await feeApproverInstance.setFeeDiscountTo(accounts[3], 600) //60%
		const receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[3])).toNumber()
		await hardcoreInstance.transfer(accounts[3], "20000", { from: primary })
		const receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[3])).toNumber()

		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 19200)
	})

	test("transfer to a fromDiscount account has no effect on fees while from it reduces fee", async () => {
		await feeApproverInstance.unPause()
		await feeApproverInstance.setFeeMultiplier(10)
		await feeApproverInstance.setFeeDiscountFrom(accounts[4], 550)
		const receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[4])).toNumber()
		await hardcoreInstance.transfer(accounts[4], "15000", { from: primary })
		const receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[4])).toNumber()
		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 13500)

		const secondReceiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[5])).toNumber()
		await hardcoreInstance.transfer(accounts[5], "200", { from: accounts[4] })
		const secondReceiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[5])).toNumber()

		assert.equal(secondReceiverBalanceAfter - secondReceiverBalanceBefore, 191)

	})

	test("blacklist", async () => {
		await feeApproverInstance.unPause()
		await feeApproverInstance.setFeeMultiplier(10)
		await feeApproverInstance.setFeeBlackList(accounts[8], 60)

		let receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[8])).toNumber()

		await hardcoreInstance.transfer(accounts[8], "100")

		let receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[8])).toNumber()

		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 90)

		receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[6])).toNumber()
		await hardcoreInstance.transfer(accounts[6], "50", { from: accounts[8] })
		receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[6])).toNumber()

		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 20)
	})
})