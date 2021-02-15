const FeeApprover = artifacts.require('FeeApprover')
const FeeDistributor = artifacts.require('FeeDistributor')
const HardCore = artifacts.require('HardCore')
const LiquidVault = artifacts.require('LiquidVault')
const NFTFund = artifacts.require('NFTFund')
const PriceOracle = artifacts.require('PriceOracle')

const Uniswapfactory = artifacts.require('UniswapV2Factory.sol')
const UniswapRouter = artifacts.require('UniswapV2Router02.sol')
const WETH = artifacts.require('WETH')

const fs = require('fs')

module.exports = async function (deployer, network, accounts) {
    
    await deployer.deploy(FeeApprover)
    const feeApproverInstance = await FeeApprover.deployed()
    await pausePromise('Fee Approver')

    await deployer.deploy(FeeDistributor)
    const feeDistributorInstance = await FeeDistributor.deployed()
    await pausePromise('fee Distributor')

    await deployer.deploy(LiquidVault)
    const liquidVaultInstance = await LiquidVault.deployed()
    await pausePromise('liquidity vault')
    
    let uniswapfactoryInstance, uniswapRouterInstance, hardCoreInstance, uniswapOracle
    if (network === 'development') {
        await deployer.deploy(Uniswapfactory, accounts[0])
        uniswapfactoryInstance = await Uniswapfactory.deployed()
        await pausePromise('uniswap test factory')
        
        await deployer.deploy(WETH, 'WETH', 'WTH')
        const wethInstance = await WETH.deployed()
        await pausePromise('test weth')

        await deployer.deploy(UniswapRouter, uniswapfactoryInstance.address, wethInstance.address)
        uniswapRouterInstance = await UniswapRouter.deployed()
        await pausePromise('uniswap test router')

        await deployer.deploy(HardCore, uniswapRouterInstance.address)
        hardCoreInstance = await HardCore.deployed()
        await pausePromise('hard core')

        await hardCoreInstance.initialSetup(feeApproverInstance.address, feeDistributorInstance.address, liquidVaultInstance.address);
        await pausePromise('hardcore initial setup')
        await hardCoreInstance.createUniswapPair(uniswapfactoryInstance.address)
        uniswapPair = await hardCoreInstance.tokenUniswapPair();

        uniswapOracle = await deployer.deploy(PriceOracle, uniswapPair, hardCoreInstance.address, wethInstance.address)
    }
    else {
        await deployer.deploy(HardCore, '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')
        hardCoreInstance = await HardCore.deployed()
        await pausePromise('hard core')
        await hardCoreInstance.initialSetup(feeApproverInstance.address, feeDistributorInstance.address, liquidVaultInstance.address);
    }

    const routerAddress = await hardCoreInstance.uniswapRouter.call()

    await deployer.deploy(NFTFund, routerAddress, hardCoreInstance.address)

    await pausePromise('seed feedistributor')
    await feeDistributorInstance.seed(hardCoreInstance.address, liquidVaultInstance.address, NFTFund.address, 40, 0)
    await pausePromise('initialize fee approver')
    uniswapPair = await hardCoreInstance.tokenUniswapPair();
    await feeApproverInstance.initialize(uniswapPair, liquidVaultInstance.address)
    await pausePromise('seed liquid vault')
    await liquidVaultInstance.seed(7, hardCoreInstance.address, feeDistributorInstance.address, NFTFund.address, 5, 20, uniswapOracle.address)
}

function pausePromise(message, durationInSeconds = 1) {
	return new Promise(function (resolve, error) {
		setTimeout(() => {
			console.log(message)
			return resolve()
		}, durationInSeconds * 10)
	})
}