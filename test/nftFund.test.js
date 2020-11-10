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
            'NFTFund: factory, router and token are zero addresses'
        )
    })
    
    test('sends HCORE to NFTFund via FeeDistributor', async () => {
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        await liquidVaultInstance.purchaseLP({ value: '1000000000000000000' })
        const nftBalanceAfter = await hardcoreInstance.balanceOf(nftFundInstance.address)
        assert.isAbove(
            Number(nftBalanceAfter), Number(nftBalance), 
            'Wrong HCORE balance in NFTFund after the fee distribution'
        )
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
        const nftBalance = await hardcoreInstance.balanceOf(nftFundInstance.address)
        const withdrawAmount = (Number(nftBalance) * 2).toString()

        await expectRevert(
            nftFundInstance.methods['withdrawTokens(uint256)'] (withdrawAmount, { from: owner }),
            'NFTFund: token amount exeeds balance'
        )
    })

    test('withdraws all HCORE from NFTFund', async () => {
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