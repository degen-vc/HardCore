const { expectEvent, expectRevert, constants } = require("@openzeppelin/test-helpers")
const { ZERO_ADDRESS } = constants

const async = require('./helpers/async.js')
const test = async.test
const setup = async.setup

const FeeApprover = artifacts.require("FeeApprover")
const Hardcore = artifacts.require('HardCore')
const NFTFund = artifacts.require('NFTFund')
const WETHUniswap = artifacts.require('WETH')

const UniswapV2FactoryBytecode = require('@uniswap/v2-core/build/UniswapV2Factory.json')
const UniswapV2Router02Bytecode = require('@uniswap/v2-periphery/build/UniswapV2Router02.json')
const TruffleContract = require('@truffle/contract')

contract('NFTFund', accounts => {
    const [ owner, seller, liquidVault, distributor ] = accounts
    const amount = '100000000000000000'
    let hardcoreInstance, feeApproverInstance, 
        nftFundInstance, router, wethInstance, factoryInstance
    let uniswapPairAddress

    setup(async () => {
        hardcoreInstance = await Hardcore.new()
        feeApproverInstance = await FeeApprover.new()
        wethInstance = await WETHUniswap.new('Wrapped Ether', 'WETH')

        const UniswapV2Factory = TruffleContract(UniswapV2FactoryBytecode);
        const UniswapV2Router02 = TruffleContract(UniswapV2Router02Bytecode);
        UniswapV2Factory.setProvider(web3.currentProvider);
        UniswapV2Router02.setProvider(web3.currentProvider);
        factoryInstance = await UniswapV2Factory.new(owner, {from: owner});
        router = await UniswapV2Router02.new(factoryInstance.address, wethInstance.address, {
            from: owner,
        });

        await hardcoreInstance.initialSetup(router.address, factoryInstance.address, feeApproverInstance.address, distributor, liquidVault)

        nftFundInstance = await NFTFund.new(factoryInstance.address, router.address, hardcoreInstance.address)

        await feeApproverInstance.initialize(hardcoreInstance.address, factoryInstance.address, router.address, liquidVault)

        await feeApproverInstance.unPause()

        uniswapPairAddress = await hardcoreInstance.tokenUniswapPair.call()
    })

    test('requires a non-null factory, router and token', async () => {
        await expectRevert(
            NFTFund.new(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, { from: owner }), 
            'NFTFund: factory, router and token are zero addresses'
        )
    })

    test('requires an owner to update factory, router and token addresses', async () => {
        await expectRevert(
            nftFundInstance.updateUniswapFactoryAddress(factoryInstance.address, { from: seller }),
            'Ownable: caller is not the owner'
        )
        await expectRevert(
            nftFundInstance.updateUniswapRouterAddress(router.address, { from: seller }),
            'Ownable: caller is not the owner'
        )
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
        const hcoreAmount = web3.utils.toWei('100')
        const deadline = new Date().getTime() + 3000
        
        await hardcoreInstance.approve(router.address, hcoreAmount)
        await router.addLiquidityETH(hardcoreInstance.address, hcoreAmount, '0', '0', owner, deadline, { 
            value: ethAmount, from: owner 
        })
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))
        
        const pairBefore = Number(await hardcoreInstance.balanceOf(uniswapPairAddress))
        const hcoreBalanceBefore = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const amountToCalculate = (hcoreBalanceBefore / 2).toString()
        const feeAmount = await feeApproverInstance.calculateAmountsAfterFee(nftFundInstance.address, uniswapPairAddress, amountToCalculate)
        
        await nftFundInstance.methods['swapTokensForETH(uint256)'] (amountToCalculate, { 
            from: seller
        })

        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))
        const hcoreBalance = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const pairBalance = Number(await hardcoreInstance.balanceOf(uniswapPairAddress))

        assert.isBelow(hcoreBalance, hcoreBalanceBefore, 'HCORE balance is more than expected')
        assert.isAbove(ethBalance, 0, 'ETH balance should be non zero')
        assert.equal(Number(feeAmount[1]), 0)
        assert.equal(Number(feeAmount[0]), pairBalance - pairBefore)
    })


    test('sells HCORE from NFTFund for ETH', async () => {
        const pairBefore = await hardcoreInstance.balanceOf(uniswapPairAddress)
        const ethBalanceBefore = Number(await web3.eth.getBalance(nftFundInstance.address))
        const amountToCalculate = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const feeAmount = await feeApproverInstance.calculateAmountsAfterFee(nftFundInstance.address, uniswapPairAddress, amountToCalculate)
        
        await nftFundInstance.methods['swapTokensForETH()'] ({ from: seller})
        
        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))
        const hcoreBalance = Number(await hardcoreInstance.balanceOf(nftFundInstance.address))
        const pairBalance = Number(await hardcoreInstance.balanceOf(uniswapPairAddress))

        assert.equal(hcoreBalance, 0)
        assert.isAbove(ethBalance, ethBalanceBefore)
        assert.equal(Number(feeAmount[1]), 0)
        assert.equal(Number(feeAmount[0]), pairBalance - pairBefore)
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
        const withdrawAmount = (Number(nftBalance) * 2).toString()

        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner }),
            'NFTFund: token amount exceeds balance'
        )
    })

    test('requires ETH balance to be enough for withdraw', async () => {
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)
        const withdrawAmount = (Number(ethBalance) * 2).toString()

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
        assert.equal(Number(nftBalanceAfter), 0)
    })

    test('withdraws certain HCORE amount from NFTFund', async () => {
        await hardcoreInstance.transfer(nftFundInstance.address, web3.utils.toWei('20'))

        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = (Number(nftBalance) / 2).toString()
        const withdraw = await nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assert.equal((Number(nftBalance) - Number(withdrawAmount)), Number(nftBalanceAfter))
    })

    test('withdraws certain ETH amount from NFTFund', async () => {
        const ethBalanceBefore = Number(await web3.eth.getBalance(nftFundInstance.address))
        const withdrawAmount = Math.floor((Number(ethBalanceBefore) / 2)).toString()
        const withdraw = await nftFundInstance.methods['withdrawETH(uint256)'] (withdrawAmount, { from: owner })
        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assert.equal(ethBalanceBefore - withdrawAmount, ethBalance)
    })

    test('withdraws all ETH from NFTFund', async () => {
        const ethBalanceBefore = Number(await web3.eth.getBalance(nftFundInstance.address))
        const withdraw = await nftFundInstance.methods['withdrawETH()'] ({ from: owner })
        const ethBalance = Number(await web3.eth.getBalance(nftFundInstance.address))

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assert.equal(ethBalance, 0)
    })
})