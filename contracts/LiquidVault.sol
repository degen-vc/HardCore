pragma solidity ^0.6.0;
import "@openzeppelin/contracts/access/Ownable.sol"; 
contract LiquidVault is Ownable {

    /*
        A user can hold multiple locked LP batches. Each batch takes 30 days to incubate
    */
    struct LPbatch {
        address holder;
        uint256 amount;
        uint256 timeStamp;
    }

    uint public stakeDuration = 30 days;
    //Front end can loop through this and inspect if enough time has passed
    mapping(address => LPbatch[]) public LPstakes;

    address public HCORE;  //use to get uni token pair
    
    function configure (uint duration, address hcore) public {
            stakeDuration = duration;
            HCORE = hcore;
    }

    //send eth to match with HCORE tokens in LiquidVault
    function purchaseLP() public payable {

    }

    //pops latest LP if older than period
    function claimLP() public {

    }
}
