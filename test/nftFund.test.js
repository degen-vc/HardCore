const { expectEvent, expectRevert, constants } = require("@openzeppelin/test-helpers")
const { ZERO_ADDRESS } = constants

const async = require('./helpers/async.js')
const deployUniswap = require('./helpers/deployUniswap')
const test = async.test
const setup = async.setup

const FeeApprover = artifacts.require("FeeApprover")
const Hardcore = artifacts.require('HardCore')
const NFTFund = artifacts.require('NFTFund')
const WETHUniswap = artifacts.require('WETH')


contract('NFTFund', accounts => {
    const [ owner, seller, liquidVault, distributor ] = accounts
    const amount = '100000000000000000'

    const bn = (input) => web3.utils.toBN(input)
    const assertBNequal = (bnOne, bnTwo) => assert.equal(bnOne.toString(), bnTwo.toString())

    let hardcoreInstance, feeApproverInstance, 
        nftFundInstance, wethInstance
    let uniswapPairAddress
    let uniswapFactory
    let uniswapRouter

    setup(async () => {
        const contracts = await deployUniswap(accounts);
        uniswapFactory = contracts.uniswapFactory;
        uniswapRouter = contracts.uniswapRouter;
        wethInstance = contracts.weth;

        hardcoreInstance = await Hardcore.new(uniswapRouter.address)
        feeApproverInstance = await FeeApprover.new()

        await hardcoreInstance.initialSetup(feeApproverInstance.address, distributor, liquidVault)
        await hardcoreInstance.createUniswapPair(uniswapFactory.address)
        nftFundInstance = await NFTFund.new(uniswapRouter.address, hardcoreInstance.address)

        uniswapPairAddress = await hardcoreInstance.tokenUniswapPair();
        await feeApproverInstance.initialize(uniswapPairAddress, liquidVault)

        await feeApproverInstance.unPause()
        await feeApproverInstance.setFeeMultiplier(10)
        await feeApproverInstance.setFeeDiscountTo(uniswapPairAddress, 0)
    })

    test('requires a non-null router and token', async () => {
        await expectRevert(
            NFTFund.new(ZERO_ADDRESS, ZERO_ADDRESS, { from: owner }), 
            'NFTFund: router and token are zero addresses'
        )
    })

    test('requires an owner to update token address', async () => {
        await expectRevert(
            nftFundInstance.updateTokenAddress(hardcoreInstance.address, { from: seller }),
            'Ownable: caller is not the owner'
        )
    })

    test('requires liquidity for selling HCORE for ETH', async () => {
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('10'))

        await expectRevert(
            nftFundInstance.methods['swapTokensForETH()'] ({ from: seller }),
            'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
        )
    })

    test('sells certain amount of HCORE for ETH', async () => {
        const ethAmount = web3.utils.toWei('10')
        const hcoreAmount = web3.utils.toWei('1000')
        const deadline = new Date().getTime() + 3000
        
        await hardcoreInstance.approve(uniswapRouter.address, hcoreAmount)
        await uniswapRouter.addLiquidityETH(hardcoreInstance.address, hcoreAmount, '0', '0', owner, deadline, { 
            value: ethAmount, from: owner 
        })
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))
        
        const pairBefore = await hardcoreInstance.balanceOf(uniswapPairAddress)
        const hcoreBalanceBefore = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const amountToCalculate = (hcoreBalanceBefore / 2).toString()
        const feeAmount = await feeApproverInstance.calculateAmountsAfterFee(nftFundInstance.address, uniswapPairAddress, amountToCalculate)
        const expectedFee = Math.floor((amountToCalculate / 100) * 10)
        
        await nftFundInstance.methods['swapTokensForETH(uint256)'] (amountToCalculate, { 
            from: seller
        })

        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))
        const hcoreBalance = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const pairBalance = await hardcoreInstance.balanceOf(uniswapPairAddress)

        assert.isBelow(hcoreBalance, hcoreBalanceBefore, 'HCORE balance is more than expected')
        assert.isAbove(ethBalance, 0, 'ETH balance should be non zero')
        assertBNequal(feeAmount[1], expectedFee)
        assertBNequal(feeAmount[0], bn(pairBalance).sub(pairBefore))
    })


    test('sells HCORE from NFTFund for ETH', async () => {
        const pairBefore = await hardcoreInstance.balanceOf(uniswapPairAddress)
        const ethBalanceBefore = Number(await web3.eth.getBalance(nftFundInstance.address))
        const amountToCalculate = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const expectedFee = Math.floor((amountToCalculate / 100) * 10)
        const feeAmount = await feeApproverInstance.calculateAmountsAfterFee(nftFundInstance.address, uniswapPairAddress, amountToCalculate)
        await nftFundInstance.methods['swapTokensForETH()'] ({ from: seller})
        
        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))
        const hcoreBalance = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const pairBalance = await hardcoreInstance.balanceOf(uniswapPairAddress)

        assertBNequal(hcoreBalance, 0)
        assert.isAbove(ethBalance, ethBalanceBefore)
        assertBNequal(feeAmount[1], expectedFee)
        assertBNequal(feeAmount[0], bn(pairBalance).sub(pairBefore))
    })

    test('requires owner to withdraw HCORE and ETH', async () => {
        await expectRevert(
            nftFundInstance.methods['withdrawTokens()'] ({ from: seller }),
            'Ownable: caller is not the owner'
        )
        await expectRevert(
            nftFundInstance.methods['withdrawETH()'] ({ from: seller }),
            'Ownable: caller is not the owner'
        )
    })

    test('requires owner to withdraw a certain amount of HCORE and ETH', async () => {
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)

        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (amount, { from: seller }),
            'Ownable: caller is not the owner'
        )
        await expectRevert(
            nftFundInstance.methods['withdrawETH(uint256)'] (ethBalance, { from: seller }),
            'Ownable: caller is not the owner'
        )
    })

    test('requires HCORE balance to be enough for withdraw', async () => {
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))

        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = bn(nftBalance).mul(bn('2'))

        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner }),
            'NFTFund: token amount exceeds balance'
        )
    })

    test('requires ETH balance to be enough for withdraw', async () => {
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)
        const withdrawAmount = bn(ethBalance).mul(bn('2'))

        await expectRevert(
            nftFundInstance.methods['withdrawETH(uint256)'] (withdrawAmount, { from: owner }),
            'NFTFund: wei amount exceeds balance'
        )
    })

    test('withdraws all HCORE from NFTFund', async () => {
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))
        
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdraw = await nftFundInstance.methods['withdrawTokens()'] ({ from: owner })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assertBNequal(nftBalanceAfter, 0)
    })

    test('withdraws certain HCORE amount from NFTFund', async () => {
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))

        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = bn(nftBalance).div(bn('2'))
        const withdraw = await nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assertBNequal(bn(nftBalance).sub(withdrawAmount), nftBalanceAfter)
    })

    test('withdraws certain ETH amount from NFTFund', async () => {
        const ethBalanceBefore = await web3.eth.getBalance(nftFundInstance.address)
        const withdrawAmount = bn(ethBalanceBefore).div(bn('2'))
        const withdraw = await nftFundInstance.methods['withdrawETH(uint256)'] (withdrawAmount, { from: owner })
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assertBNequal(bn(ethBalanceBefore).sub(withdrawAmount), ethBalance)
    })

    test('withdraws all ETH from NFTFund', async () => {
        const withdraw = await nftFundInstance.methods['withdrawETH()'] ({ from: owner })
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assertBNequal(ethBalance, 0)
    })
})