pragma solidity ^0.6.0;
import "@openzeppelin/contracts/access/Ownable.sol";

contract FeeDistributor is Ownable {

    function setLiquidShare (uint share) public onlyOwner {
        liquidVaultShare = share;
    }

    uint public liquidVaultShare; //percentage between 0 and 100

    function distributeFees() public {

    }
}