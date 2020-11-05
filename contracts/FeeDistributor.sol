// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./facades/ERC20Like.sol";
import "./INFTFund.sol";

contract FeeDistributor is Ownable {
    using SafeMath for uint;

    ERC20Like public hcore;

    struct FeeRecipient {
        address liquidVault;
        address dev;
        uint256 liquidVaultShare; //percentage between 0 and 100
        uint256 burnPercentage;
    }

    FeeRecipient public recipients;

    bool public initialized;

    modifier seeded {
        require(
            initialized,
            "HARDCORE: Fees cannot be distributed until Distributor seeded."
        );
        _;
    }

    function seed(
        address hardCore,
        address liquidVault,
        address dev,
        uint256 liquidVaultShare,
        uint256 burnPercentage
    ) public onlyOwner {
        require(
            liquidVaultShare <= 100,
            "HARDCORE: liquidVault share must be between 0 and 100"
        );
        require(
            burnPercentage <= 100,
            "HARDCORE: burnPercentage share must be between 0 and 100"
        );
        require(
            liquidVaultShare.add(burnPercentage) <= 100,
            "HARDCORE: liquidVault + burnPercentage incorrect sets"
        );

        hcore = ERC20Like(hardCore);
        recipients.liquidVault = liquidVault;
        recipients.dev = dev;
        recipients.liquidVaultShare = liquidVaultShare;
        recipients.burnPercentage = burnPercentage;
        initialized = true;
    }

    function distributeFees() public seeded {
        uint256 balance = hcore.balanceOf(address(this));

        require(balance > 100, "HARDCORE: low token balance");

        uint256 liquidShare;
        uint256 burningShare;

        if (recipients.liquidVaultShare > 0) {
            liquidShare = recipients.liquidVaultShare.mul(balance).div(100);

            require(
                hcore.transfer(recipients.liquidVault, liquidShare),
                "HARDCORE: transfer to liquidVault failed"
            );
        }

        if (recipients.burnPercentage > 0) {
            burningShare = recipients.burnPercentage.mul(balance).div(100);
            (bool success, ) = address(hcore).delegatecall(
                abi.encodeWithSelector(hcore.transferFrom.selector, burningShare)
            );

            require(success, "HARDCORE: token burn fail");
        }

        require(
            hcore.transfer(recipients.dev, balance.sub(liquidShare).sub(burningShare)),
            "HARDCORE: transfer to dev failed"
        );

        INFTFund(recipients.dev).deposit(balance.sub(liquidShare).sub(burningShare));
    }
}