// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "./LiquidVaultFacade.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Hardcore.sol";
import "../facades/FeeDistributorLike.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../PriceOracle.sol";
import "./BadCore.sol";

/*
1. Once disabled, go to etherscan and find out what everyone has as claimable. 
Record this somewhere. We'll use this to relaunch LV
2. Write a contract that will be the new owner of the LV. We'll transfer ownership of LV to contract. This contract must be able to return ownership to whoever sent it. We'll call the contract FlashRescue
3. FlashRescue sets all the parameters to release LP very quickly.
4. FlashRescue has a function which in one transaction reenables LV, purchases LP and then redisables
5. FlashRescue has another function which in one transaction reenables LV, claims all the LP and then redisables
6. Flash rescue then sends the LP to a wallet we decide like Fraser's.

Fix the LV bug, test it and then add a section that allows the owner to manually seed the claim queues so we can set it back to how it was for all the users.
give the LP to fee distributor and redeploy LV.
You can pick up where you left off

Maybe also put an emergency shutdown function for the new version which seizes all the LP and disables claim and then give it a 100 day expiration or something
*/

//tokenUniswapPair()
contract FlashRescue is Ownable {
    LiquidVaultFacade public LV;
    HardCore public hardCore;
    address badCore;

    struct LVconfigBefore {
        address hcore;
        address feeDistributor;
        address payable ethReceiver;
        uint8 donationShare; // LP Token
        uint8 purchaseFee; // ETH
        address uniswapOracle;
        uint32 duration;
        bool seeded;
    }

    LVconfigBefore public LV_config_before;

    constructor() public {
        badCore = address(new BadCore());
    }

    function captureConfig(
        uint32 duration,
        address hcore,
        address feeDistributor,
        address payable ethReceiver,
        uint8 donationShare, // LP Token
        uint8 purchaseFee, // ETH
        address uniswapOracle
    ) public onlyOwner {
        LV_config_before.duration = duration;
        LV_config_before.hcore = hcore;
        LV_config_before.feeDistributor = feeDistributor;
        LV_config_before.ethReceiver = ethReceiver;
        LV_config_before.donationShare = donationShare;
        LV_config_before.purchaseFee = purchaseFee;
        LV_config_before.uniswapOracle = uniswapOracle;
        LV_config_before.seeded = true;
    }

    modifier allAboveBoard {
        require(owner() == msg.sender, "FLASHRESCUE: owner violation.");
        require(
            LV_config_before.seeded,
            "FLASHRESCUE: LV configuration not captured."
        );
        _enableLV();
        _;
        _disableLV();
    }

    function seed(address liquidVault, address hcore) public allAboveBoard {
        LV = LiquidVaultFacade(liquidVault);
        require(
            Ownable(LV).owner() == address(this),
            "FLASH_RESCUE: transfer ownership of LV"
        );
        hardCore = HardCore(hcore);
        require(address(this).balance > 0, "FLASHRESCUE: I must have eth");
    }

    function returnOwnershipOfLV() public onlyOwner {
        //test that eth is released and that it works for eth == 0
        withdrawLP();
        Ownable(LV).transferOwnership(owner());
        msg.sender.call{ value: address(this).balance }("");
    }

    //step 1
    function adminPurchaseLP() public allAboveBoard {
        LV.purchaseLP{ value: address(this).balance }();
    }

    //step 2
    function claimLP(uint256 iterations) public allAboveBoard {
        for (uint256 i = 0; i < iterations; i++) {
            LV.claimLP();
        }
    }

    //step3
    function withdrawLP() public onlyOwner {
        IUniswapV2Pair pair = IUniswapV2Pair(hardCore.tokenUniswapPair());
        uint256 balance = pair.balanceOf(address(this));
        pair.transfer(owner(), balance);
    }

    function claimableAmountInLP() public view returns (uint256) {
        IUniswapV2Pair pair = IUniswapV2Pair(hardCore.tokenUniswapPair());
        return pair.balanceOf(address(LV));
    }

    function _disableLV() internal {
        LV.seed(
            0,
            badCore,
            LV_config_before.feeDistributor,
            LV_config_before.ethReceiver,
            0,
            0,
            LV_config_before.uniswapOracle
        );
    }

    function _enableLV() internal {
        LV.seed(
            0,
            address(hardCore),
            LV_config_before.feeDistributor,
            LV_config_before.ethReceiver,
            0,
            0,
            LV_config_before.uniswapOracle
        );
    }
}
