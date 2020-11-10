const { expectEvent, expectRevert, constants } = require("@openzeppelin/test-helpers")
const { ZERO_ADDRESS } = constants

const async = require('./helpers/async.js')
const test = async.test
const setup = async.setup

const Distributor = artifacts.require("FeeDistributor")
const FeeApprover = artifacts.require("FeeApprover")
const LiquidVault = artifacts.require("LiquidVault")
const Hardcore = artifacts.require('Hardcore')
const NFTFund = artifacts.require('NFTFund')
const uniswapPair = artifacts.require('UniswapV2Pair')
const WETHUniswap = artifacts.require('WETH')

const UniswapV2FactoryBytecode = require('@uniswap/v2-core/build/UniswapV2Factory.json')
const UniswapV2Router02Bytecode = require('@uniswap/v2-periphery/build/UniswapV2Router02.json')
const TruffleContract = require('@truffle/contract')

contract('NFTFund', accounts => {
    const [ owner, seller ] = accounts
    const amount = '100000000000000000'
    let hardcoreInstance, liquidVaultInstance, feeAproverInstance, distributorInstance, 
        nftFundInstance, router, wethInstance, factoryInstance

    setup(async () => {
        hardcoreInstance = await Hardcore.deployed()
        liquidVaultInstance = await LiquidVault.deployed()
        feeAproverInstance = await FeeApprover.deployed()
        distributorInstance = await Distributor.deployed()
        wethInstance = await WETHUniswap.deployed()

        const UniswapV2Factory = TruffleContract(UniswapV2FactoryBytecode);
        const UniswapV2Router02 = TruffleContract(UniswapV2Router02Bytecode);
        UniswapV2Factory.setProvider(web3.currentProvider);
        UniswapV2Router02.setProvider(web3.currentProvider);
        factoryInstance = await UniswapV2Factory.new(owner, {from: owner});
        router = await UniswapV2Router02.new(factoryInstance.address, wethInstance.address, {
            from: owner,
        });

        nftFundInstance = await NFTFund.new(factoryInstance.address, router.address, hardcoreInstance.address)

        await distributorInstance.seed(hardcoreInstance.address, liquidVaultInstance.address, nftFundInstance.address, 40, 1)
        await feeAproverInstance.initialize(hardcoreInstance.address, factoryInstance.address, router.address, liquidVaultInstance.address)
        await liquidVaultInstance.seed(2, hardcoreInstance.address, distributorInstance.address, accounts[3], 10, 1)

        await feeAproverInstance.unPause()
        await hardcoreInstance.transfer(distributorInstance.address, amount)
    })

    test('requires a non-null factory, router and token', async () => {
        await expectRevert(
            NFTFund.new(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, { from: owner }), 
            'NFTFund: factory, router and token are zero addresses'
        )
    })
    
    test('sends HCORE to NFTFund via FeeDistributor', async () => {
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        await liquidVaultInstance.purchaseLP({ value: '1000000000000000000' })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const ethPairBalance = await web3.eth.getBalance(liquidVaultInstance.address)
        
        assert.isAbove(
            Number(nftBalanceAfter), Number(nftBalance), 
            'Wrong HCORE balance in NFTFund after the fee distribution'
        )
    })


    test('sells HCORE from NFTFund for ETH', async () => {
        const ethAmount = web3.utils.toWei('10')
        const hcoreAmount = web3.utils.toWei('100')
        await hardcoreInstance.approve(router.address, hcoreAmount)
        const deadline = new Date().getTime() + 3000
        const liquidity = await router.addLiquidityETH(hardcoreInstance.address, hcoreAmount, '0', '0', owner, deadline, { value: ethAmount, from: owner })
        const sell = await nftFundInstance.methods['swapTokensForETH()'] ({ from: seller})
        const ethBalance = await web3.eth.getBalance(nftFundInstance.address)
    })

    test('requires owner to withdraw HCORE', async () => {
        await expectRevert(
            nftFundInstance.methods['withdrawTokens()'] ({ from: seller }),
            'Ownable: caller is not the owner'
        )
    })

    test('requires owner to withdraw a certain amount of HCORE', async () => {
        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (amount, { from: seller }),
            'Ownable: caller is not the owner'
        )
    })

    test('requires HCORE balance to be enough for withdraw', async () => {
        await liquidVaultInstance.purchaseLP({ value: amount })
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = (Number(nftBalance) * 2).toString()

        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner }),
            'NFTFund: token amount exeeds balance'
        )
    })

    test('withdraws all HCORE from NFTFund', async () => {
        await liquidVaultInstance.purchaseLP({ value: amount })
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdraw = await nftFundInstance.methods['withdrawTokens()'] ({ from: owner })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assert.equal(Number(nftBalanceAfter), 0)
    })

    test('withdraws certain HCORE amount from NFTFund', async () => {
        await hardcoreInstance.transfer(distributorInstance.address, amount)
        await liquidVaultInstance.purchaseLP({ value: amount })

        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = (Number(nftBalance) / 2).toString()
        const withdraw = await nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.equal(withdraw.receipt.from, owner.toLowerCase())
        assert.equal((Number(nftBalance) - Number(withdrawAmount)), Number(nftBalanceAfter))
    })
})