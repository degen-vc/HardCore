pragma solidity ^0.6.0;
import "@openzeppelin/contracts/access/Ownable.sol";

contract FeeDistributor is Ownable {

    feeProportion public liquidVault; 
    feeProportion public nftVault; 
    feeProportion public marketingVault;
    feeProportion public devVault; 
    feeProportion public devVault2;

    struct feeProportion {
        address recipient;
        uint feeProportion;
    }

    function setLiquidVault (address v, address p) public    onlyOwner {}   
    function setNftVault   (address v, address p)     public onlyOwner {}     
    function setMarketingVault  (address v, address p) public onlyOwner {}      
    function setDevVault     (address v, address p)  public   onlyOwner {}   
    function setFallback     (address v, address p)  public  onlyOwner {}   


    function distributeFees() public {

    }
}