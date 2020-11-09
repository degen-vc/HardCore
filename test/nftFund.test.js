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

contract('NFTFund', accounts => {
    const [ owner, seller ] = accounts
    const amount = '100000000000000000'
    let hardcoreInstance, liquidVaultInstance, feeAproverInstance, distributorInstance, nftFundInstance

    setup(async () => {
        hardcoreInstance = await Hardcore.deployed()
        liquidVaultInstance = await LiquidVault.deployed()
        feeAproverInstance = await FeeApprover.deployed()
        distributorInstance = await Distributor.deployed()
        nftFundInstance = await NFTFund.deployed()

        await feeAproverInstance.unPause()
        await hardcoreInstance.transfer(distributorInstance.address, amount)
    })

    test('requires a non-null factory, router and token', async () => {
        await expectRevert(
            NFTFund.new(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, { from: owner }), 
            'NFTFund: factory, router and token are the zero addresses'
        )
    })
    
    test('sends HCORE to NFTFund via FeeDistributor', async () => {
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        await liquidVaultInstance.purchaseLP({ value: amount })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)

        assert.isAbove(
            Number(nftBalanceAfter), Number(nftBalance), 
            'Wrong HCORE balance in NFTFund after the fee distribution'
        )
    })
})