const FeeApprover = artifacts.require('FeeApprover')
const FeeDistributor = artifacts.require('FeeDistributor')
const HardCore = artifacts.require('HardCore')
const LiquidVault = artifacts.require('LiquidVault')
const NFTFund = artifacts.require('NFTFund')

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

    await deployer.deploy(HardCore)
    const hardCoreInstance = await HardCore.deployed()
    await pausePromise('hard core')

    await deployer.deploy(LiquidVault)
    const liquidVaultInstance = await LiquidVault.deployed()
    await pausePromise('liquidity vault')
    

    let uniswapfactoryInstance, uniswapRouterInstance
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

        await hardCoreInstance.initialSetup(uniswapRouterInstance.address, uniswapfactoryInstance.address, feeApproverInstance.address, feeDistributorInstance.address, liquidVaultInstance.address);
        await pausePromise('hardcore initial setup')
    }
    else {
        await hardCoreInstance.initialSetup('0x0', '0x0', feeApproverInstance.address, feeDistributorInstance.address,liquidVaultInstance.address);
    }

    const factoryAddress = await hardCoreInstance.uniswapFactory.call()
    const routerAddress = await hardCoreInstance.uniswapRouter.call()

    await deployer.deploy(NFTFund, factoryAddress, routerAddress, hardCoreInstance.address)

    await pausePromise('seed feedistributor')
    await feeDistributorInstance.seed(hardCoreInstance.address, liquidVaultInstance.address, NFTFund.address, 40, 1)
    await pausePromise('seed fee approver')
    await feeApproverInstance.initialize(hardCoreInstance.address, factoryAddress, routerAddress, liquidVaultInstance.address)
    await pausePromise('seed liquid vault')
    await liquidVaultInstance.seed(2, hardCoreInstance.address, feeDistributorInstance.address, NFTFund.address, 10, 10)
}

function pausePromise(message, durationInSeconds = 1) {
	return new Promise(function (resolve, error) {
		setTimeout(() => {
			console.log(message)
			return resolve()
		}, durationInSeconds * 10)
	})
}