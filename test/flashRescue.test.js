
const async = require('./helpers/async.js')
const expectThrow = require('./helpers/expectThrow').handle
const time = require('./helpers/time')
const test = async.test
const setup = async.setup
const deployUniswap = require('./helpers/deployUniswap')

const hardcore = artifacts.require("HardCore")
const distributor = artifacts.require("FeeDistributor")
const feeApprover = artifacts.require("FeeApprover")
const liquidVault = artifacts.require("BrokenVault")
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair')
const PriceOracle = artifacts.require('PriceOracle')
const FlashRescue = artifacts.require('FlashRescue')

const bn = (input) => web3.utils.toBN(input)
const assertBNequal = (bnOne, bnTwo) => assert.equal(bnOne.toString(), bnTwo.toString())

contract('flash rescue', function (accounts) {
    const [primary, someoneElse, owner] = accounts;
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async function () {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new({ from: owner })
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
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await hardcoreInstance.transfer(distributorInstance.address, '25000000000')
        this.flashRescue = await FlashRescue.new({ from: owner })
    })

    test("calling seed without transferring ownership of LV fails", async function () {
        await expectThrow(this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner }), "FLASH_RESCUE: transfer ownership of LV");
    })

    test("calling seed without sending ether fails", async function () {
        await liquidVaultInstance.transferOwnership(this.flashRescue.address, { from: owner })
        await expectThrow(this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner }), "FLASHRESCUE: I must have eth");
    })

})

contract('flash rescue', accounts => {
    const [primary, someoneElse, owner] = accounts;
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async function () {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new({ from: owner })
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
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await hardcoreInstance.transfer(distributorInstance.address, '25000000000')
        this.flashRescue = await FlashRescue.new({ from: owner })
    })

    test("calling purchase before capture config fails", async function () {
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


        await liquidVaultInstance.transferOwnership(this.flashRescue.address, { from: owner })
        await this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner, value: "1000" })
        await expectThrow(this.flashRescue.adminPurchaseLP({ from: owner }), "FLASHRESCUE: LV configuration not captured.");
    })
})

contract('flash rescue', accounts => {
    const [primary, someoneElse, owner] = accounts;
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async function () {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new({ from: owner })
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
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await hardcoreInstance.transfer(distributorInstance.address, '25000000000')
        this.flashRescue = await FlashRescue.new({ from: owner })
    })

    test("calling liquid vault purchase after capture config fails - disabed", async function () {
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


        await liquidVaultInstance.transferOwnership(this.flashRescue.address, { from: owner })
        await this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner, value: "1000" })
        await this.flashRescue.captureConfig(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await expectThrow(liquidVaultInstance.purchaseLP({ value: 10 }), "revert")
    })

})

contract('flash rescue', accounts => {
    const [primary, someoneElse, owner] = accounts;
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async function () {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new({ from: owner })
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
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await hardcoreInstance.transfer(distributorInstance.address, '2500000000000000')
        this.flashRescue = await FlashRescue.new({ from: owner })
    })

    test("Calling in squence advances the steps", async function () {
        await hardcoreInstance.transfer(liquidVaultInstance.address, '1000000000000000000000')

        const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair);
        const liquidityTokensAmount = '1000000000000000000000'; // 1.000 tokens
        const liquidityEtherAmount = '20000000000000000000'; // 20 ETH

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

        await liquidVaultInstance.purchaseLP({ from: primary, value: '200' }) // more than 1 person holding LP

        await liquidVaultInstance.transferOwnership(this.flashRescue.address, { from: owner })
        await this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner, value: "20" })
        await this.flashRescue.captureConfig(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        let currentStep = (await this.flashRescue.currentStep.call()).toNumber()
        assert.equal(currentStep, 0)

        await time.advanceTimeAndBlock(1000)
        await this.flashRescue.DoInSequence(1, { from: owner })
        currentStep = (await this.flashRescue.currentStep.call()).toNumber()
        assert.equal(currentStep, 1)

        let remainingBalance = BigInt(await lpTokenInstance.balanceOf.call(liquidVaultInstance.address)).toString()

        let batch = (await liquidVaultInstance.getLockedLP(flashRescue.address, 0))

        console.log(`BEFORE: balance in vault: ${remainingBalance}, my batch: ${batch[1].toString()}`)

        let i = 0;
        while (await this.flashRescue.flashRescueCanStillClaim.call()) {
            await time.advanceTimeAndBlock(1000)
            await this.flashRescue.DoInSequence(1, { from: owner })
            await time.advanceBlock(1000)
            currentStep = (await this.flashRescue.currentStep.call()).toNumber()
            assert.equal(currentStep, 1)
            i++;
        }
        console.log('i:' + i)


        remainingBalance = parseInt((await lpTokenInstance.balanceOf.call(liquidVaultInstance.address)).toString())

        batch = (await liquidVaultInstance.getLockedLP(flashRescue.address, 0))

        console.log(`remaining balance in vault: ${remainingBalance}, my batch: ${batch[1].toString()}`)
        assert.isAtLeast(i, 10)
        assert.isBelow(remainingBalance, batch[1].toNumber())

        const lpBalanceBefore = (await lpTokenInstance.balanceOf.call(owner)).toNumber()
        assert.equal(lpBalanceBefore, 0)

        await this.flashRescue.DoInSequence(1, { from: owner })
        const lpBalanceAfter = (await lpTokenInstance.balanceOf.call(owner)).toNumber()
        assert.equal(lpBalanceAfter, 1200)

        currentStep = (await this.flashRescue.currentStep.call()).toNumber()
        assert.equal(currentStep, 3)
    })

})

contract('flash rescue', function (accounts) {
    const [primary, someoneElse, owner] = accounts;
    const primaryOptions = { from: accounts[0], gas: "0x6091b7" }
    var hardcoreInstance, liquidVaultInstance, feeApproverInstance, distributorInstance
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter
    let wethInstance
    let uniswapOracle

    setup(async function () {
        const contracts = await deployUniswap(accounts)
        uniswapFactory = contracts.uniswapFactory
        uniswapRouter = contracts.uniswapRouter
        wethInstance = contracts.weth

        hardcoreInstance = await hardcore.new(uniswapRouter.address)
        liquidVaultInstance = await liquidVault.new({ from: owner })
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
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await hardcoreInstance.transfer(distributorInstance.address, '2500000000000000')
        this.flashRescue = await FlashRescue.new({ from: owner })

        await hardcoreInstance.transfer(liquidVaultInstance.address, '1000000000000000000000')

        const liquidityTokensAmount = '1000000000000000000000'; // 1.000 tokens
        const liquidityEtherAmount = '20000000000000000000'; // 20 ETH

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
    })

    test('emergency ETH withdraw', async () => {
        await liquidVaultInstance.transferOwnership(this.flashRescue.address, { from: owner })
        await this.flashRescue.seed(liquidVaultInstance.address, hardcoreInstance.address, { from: owner, value: "50" })

        await this.flashRescue.emergencyWithdrawETH("10", { from: owner })
    })

    test('purchaseLP and claim it', async () => {
        const lpTokenInstance = await IUniswapV2Pair.at(uniswapPair);

        await this.flashRescue.captureConfig(2, hardcoreInstance.address, distributorInstance.address, accounts[7], 10, 10, uniswapOracle.address, { from: owner })
        await this.flashRescue.adminPurchaseLP({ from: owner })

        await time.advanceTime(1)

        await this.flashRescue.claimLP(1, { from: owner })
        const flashRescueBefore = await lpTokenInstance.balanceOf(this.flashRescue.address)
        
        await this.flashRescue.withdrawLPTo(someoneElse, { from: owner })
        const recipientBalanceAfter = await lpTokenInstance.balanceOf(someoneElse)

        assertBNequal(flashRescueBefore, recipientBalanceAfter)
    })

    test('return ownership without withdraw', async () => {
        assert.equal(await liquidVaultInstance.owner(), this.flashRescue.address)

        await this.flashRescue.returnOwnershipOfLvWithoutWithdraw({ from: owner })

        assert.equal(await liquidVaultInstance.owner(), owner)
    })
})
