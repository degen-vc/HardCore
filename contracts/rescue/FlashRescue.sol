// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "./LiquidVaultFacade.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Hardcore.sol";
import "../facades/FeeDistributorLike.sol";
import "../PriceOracle.sol";
import "./BadCore.sol";

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

    enum Step { Unpurchased, Purchased, FinishedClaiming, Withdrawn }

    Step public currentStep;

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
        _disableLV();
    }

    modifier allAboveBoard {
        require(
            owner() == msg.sender || address(this) == msg.sender,
            "FLASHRESCUE: owner violation."
        );
        require(
            LV_config_before.seeded,
            "FLASHRESCUE: LV configuration not captured."
        );
        _enableLV();
        _;
        _disableLV();
    }

    function seed(address liquidVault, address hcore) public payable onlyOwner {
        LV = LiquidVaultFacade(liquidVault);
        require(
            Ownable(LV).owner() == address(this),
            "FLASH_RESCUE: transfer ownership of LV"
        );
        hardCore = HardCore(hcore);
        require(msg.value > 0, "FLASHRESCUE: I must have eth");
    }

    function returnOwnershipOfLV() public onlyOwner {
        //test that eth is released and that it works for eth == 0
        withdrawLP();
        Ownable(LV).transferOwnership(owner());
        msg.sender.call{ value: address(this).balance }("");
    }

    function returnOwnershipOfLvWithoutWithdraw() public onlyOwner {
        Ownable(LV).transferOwnership(owner());
    }

    function emergencyWithdrawETH(uint256 weiAmount) public onlyOwner {
        msg.sender.transfer(weiAmount);
    }

    bool alreadyPurchased = false;

    //step 1
    function adminPurchaseLP() public allAboveBoard {
        require(
            !alreadyPurchased,
            "FLASHRESCUE: you've already purchased. Stop it."
        );
        LV.purchaseLP{ value: address(this).balance }();
        alreadyPurchased = true;
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
        if (balance > 0) pair.transfer(owner(), balance);
    }

    function withdrawLPTo(address to) public onlyOwner {
        IUniswapV2Pair pair = IUniswapV2Pair(hardCore.tokenUniswapPair());
        uint256 balance = pair.balanceOf(address(this));
        if (balance > 0) pair.transfer(to, balance);
    }

    function withdrawLPAmount(uint256 amount) public onlyOwner {
        IUniswapV2Pair pair = IUniswapV2Pair(hardCore.tokenUniswapPair());
        pair.transfer(owner(), amount);
    }

    function claimableAmountInLP() public view returns (uint256) {
        IUniswapV2Pair pair = IUniswapV2Pair(hardCore.tokenUniswapPair());
        return pair.balanceOf(address(LV));
    }

    function flashRescueCanStillClaim() public view returns (bool) {
        uint256 amountLeftInLV = claimableAmountInLP();
        (, uint256 flashAmount, ) = LV.getLockedLP(address(this), 0);
        return flashAmount <= amountLeftInLV; //only possible because of bug
    }

    function DoInSequence(uint256 iterationsOnClaim) public onlyOwner {
        if (currentStep == Step.Unpurchased) {
            adminPurchaseLP();
            currentStep = Step.Purchased;
            return;
        }

        if (currentStep == Step.Purchased) {
            _enableLV();
            if (flashRescueCanStillClaim()) {
                claimLP(iterationsOnClaim);
            } else {
                currentStep = Step.FinishedClaiming;
            }
            _disableLV();
        }

        if (currentStep == Step.FinishedClaiming) {
            withdrawLP();
            currentStep = Step.Withdrawn;
        }
    }

    function _disableLV() internal {
        LV.seed(
            0,
            address(badCore),
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
