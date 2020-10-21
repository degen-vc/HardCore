const FeeApprover = artifacts.require('FeeApprover')
const FeeDistributor = artifacts.require('FeeDistributor')
const HardCore = artifacts.require('HardCore')
const LiquidVault = artifacts.require('LiquidVault')

const Uniswapfactory = artifacts.require('UniswapV2Factory.sol');
const UniswapRouter = artifacts.require('UniswapV2Router02.sol')
const WETH = artifacts.require('WETH')

const fs = require('fs')

module.exports = async function (deployer, network, accounts) {

    await deployer.deploy(FeeApprover)
    const feeApproverInstance = await FeeApprover.deployed()

    await deployer.deploy(FeeDistributor)
    const feeDistributorInstance = await FeeDistributor.deployed()

    await deployer.deploy(HardCore)
    const hardCoreInstance = await HardCore.deployed()

    await deployer.deploy(LiquidVault)
    const liquidVaultInstance = await LiquidVault.deployed()



    let uniswapfactoryInstance, uniswapRouterInstance
    if (network === 'development') {
        await deployer.deploy(Uniswapfactory, accounts[0])
        uniswapfactoryInstance = await Uniswapfactory.deployed()

        await deployer.deploy(WETH, 'WETH', 'WTH')
        const wethInstance = await WETH.deployed()

        await deployer.deploy(UniswapRouter, uniswapfactoryInstance.address, wethInstance.address)
        uniswapRouterInstance = await UniswapRouter.deployed()

        await hardCoreInstance.initialSetup(uniswapRouterInstance.address, uniswapfactoryInstance.address, feeApproverInstance.address, feeDistributorInstance.address);
    }
    else {
        await hardCoreInstance.initialSetup('0x0', '0x0', feeApproverInstance.address, feeDistributorInstance.address);
    }

    const factoryAddress = await hardCoreInstance.uniswapFactory.call()
    const routerAddress = await hardCoreInstance.uniswapRouter.call()

    await feeDistributorInstance.seed(hardCoreInstance.address, liquidVaultInstance.address, accounts[1], 40)
    await feeApproverInstance.initialize(hardCoreInstance.address, factoryAddress, routerAddress, liquidVaultInstance.address)
    await liquidVaultInstance.seed(2, hardCoreInstance.address, feeDistributorInstance.address, accounts[3], 10)
}