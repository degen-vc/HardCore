
const async = require('./helpers/async.js')
const expectThrow = require('./helpers/expectThrow').handle

const test = async.test
const setup = async.setup
const hardcore = artifacts.require("HardCore")
const distributor = artifacts.require("FeeDistributor")
const feeApprover = artifacts.require("FeeApprover")
let primary = ""
contract('hardcore paused', accounts => {
	var hardcoreInstance
	const primaryOptions = { from: accounts[0], gas: "0x6091b7" }

	setup(async () => {
		hardcoreInstance = await hardcore.deployed()
		primary = accounts[0]
	})

	test("transfer while paused fails", async () => {
		await expectThrow(hardcoreInstance.transfer(accounts[2], "1000", { from: primary }), 'HARDCORE: system not yet initialized')
	})

})

contract('hardcore unpaused', accounts => {
	var hardcoreInstance, feeApproverInstance, distriburorInstance
	const primaryOptions = { from: accounts[0], gas: "0x6091b7" }

	setup(async () => {
		hardcoreInstance = await hardcore.deployed()
		primary = accounts[0]
		feeApproverInstance = await feeApprover.deployed()
		distriburorInstance = await distributor.deployed()
		await feeApproverInstance.unPause()
	})

	test("trading exacts a standard fee", async () => {
		const feeDistributorBalanceBefore = (await hardcoreInstance.balanceOf(distriburorInstance.address)).toNumber()

		const feePercentage = (await feeApproverInstance.feePercentX100.call()).toNumber()
		assert.equal(feePercentage, 10)
		const receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[2])).toNumber()

		hardcoreInstance.transfer(accounts[2], "100000", { from: primary })
		const receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[2])).toNumber()
		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 90000)
		const feeDistributorBalanceAfter = (await hardcoreInstance.balanceOf(distriburorInstance.address)).toNumber()
		assert.equal(feeDistributorBalanceAfter - feeDistributorBalanceBefore, 10000)
	})

	test("transfer to a toDiscount account reduces fee while from does not", async () => {
		await feeApproverInstance.setFeeDiscountTo(accounts[3], 600) //60%
		const receiverBalanceBefore = (await hardcoreInstance.balanceOf.call(accounts[3])).toNumber()
		await hardcoreInstance.transfer(accounts[3], "20000", { from: primary })
		const receiverBalanceAfter = (await hardcoreInstance.balanceOf.call(accounts[3])).toNumber()

		assert.equal(receiverBalanceAfter - receiverBalanceBefore, 19200)
	})

	test("transfer to a fromDiscount account has no effect on fees while from it reduces fee", async () => {
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