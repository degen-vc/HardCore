// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;import "@openzeppelin/contracts/access/Ownable.sol";
import "./facades/ERC20Like.sol";

contract FeeDistributor is Ownable {

    ERC20Like public hcore;
    
    struct feeRecipient {
        address liquidVault;
        address dev;
        uint liquidVaultShare; //percentage between 0 and 100
    }

    feeRecipient public recipients;

    bool public initialized;

    modifier seeded {
        require(initialized,"HARDCORE: Fees cannot be distributed until Distributor seeded.");
        _;
    }

    function seed(address hardCore, address liquidVault, address dev, uint liquidVaultShare) public onlyOwner{
        require(liquidVaultShare<=100, "HARDCORE: liquidVault share must be expressed as percentage between 0 and 100");
        hcore = ERC20Like(hardCore);
        recipients.liquidVault = liquidVault;
        recipients.dev = dev;
        recipients.liquidVaultShare= liquidVaultShare;
        initialized = true;
    }

    function distributeFees() public seeded {
        uint balance = hcore.balanceOf(address(this));
        uint liquidShare = (recipients.liquidVaultShare*balance)/100; //overflow not possible because balance is capped low
        require(hcore.transfer(recipients.liquidVault,liquidShare),"HARDCORE: transfer to liquidVault failed");
        require(hcore.transfer(recipients.dev,balance - liquidShare),"HARDCORE: transfer to dev failed");
    }
}