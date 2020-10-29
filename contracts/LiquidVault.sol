// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./facades/HardCoreLike.sol";
import "./facades/FeeDistributorLike.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract LiquidVault is Ownable {
    /*
        A user can hold multiple locked LP batches. Each batch takes 30 days to incubate
    */
    event LPQueued(
        address holder,
        uint256 amount,
        uint256 eth,
        uint256 hardCore,
        uint256 timeStamp
    );

    event LPClaimed(
        address holder,
        uint256 amount,
        uint256 timestamp,
        uint256 exitfee
    );

    struct LPbatch {
        address holder;
        uint256 amount;
        uint256 timestamp;
    }

    struct liquidVaultConfig {
        address hardCore;
        IUniswapV2Router02 uniswapRouter;
        IUniswapV2Pair tokenPair;
        FeeDistributorLike feeDistributor;
        uint256 stakeDuration;
        address self;
        address weth;
        address donation;
        uint256 donationShare; //0-100
    }

    bool private locked;
    modifier lock {
        require(!locked, "HARDCORE: reentrancy violation");
        locked = true;
        _;
        locked = false;
    }

    liquidVaultConfig public config;
    //Front end can loop through this and inspect if enough time has passed
    mapping(address => LPbatch[]) public LockedLP;

    function seed(
        uint256 duration,
        address hcore,
        address feeDistributor,
        address donation,
        uint256 donationShare
    ) public onlyOwner {
        require(
            donationShare <= 100,
            "HardCore: donation share % between 0 and 100"
        );
        config.stakeDuration = duration * 1 days;
        config.hardCore = hcore;
        config.uniswapRouter = IUniswapV2Router02(
            HardCoreLike(hcore).uniswapRouter()
        );
        config.tokenPair = IUniswapV2Pair(
            HardCoreLike(hcore).tokenUniswapPair()
        );
        config.feeDistributor = FeeDistributorLike(feeDistributor);
        config.weth = config.uniswapRouter.WETH();
        config.self = address(this);
        config.donation = donation;
        config.donationShare = donationShare;
    }

    function purchaseLPFor(address beneficiary) public payable lock {
         config.feeDistributor.distributeFees();
        require(msg.value > 0, "HARDCORE: eth required to mint Hardcore LP");
        (address token0, ) = config.hardCore < config.weth
            ? (config.hardCore, config.weth)
            : (config.weth, config.hardCore);
        (uint256 reserve1, uint256 reserve2, ) = config.tokenPair.getReserves();
        uint256 hardCoreRequired = 0;

        if (config.tokenPair.totalSupply() == 0) {
            hardCoreRequired = HardCoreLike(config.hardCore).balanceOf(
                address(this)
            );
        } else if (token0 == config.hardCore) {
            hardCoreRequired = config.uniswapRouter.quote(
                msg.value,
                reserve2,
                reserve1
            );
        } else {
            hardCoreRequired = config.uniswapRouter.quote(
                msg.value,
                reserve1,
                reserve2
            );
        }
        uint256 balance = HardCoreLike(config.hardCore).balanceOf(config.self);
        require(
            balance >= hardCoreRequired,
            "HARDCORE: insufficient HardCore in LiquidVault"
        );

        IWETH(config.weth).deposit{value: msg.value}();
        address tokenPairAddress = address(config.tokenPair);
        IWETH(config.weth).transfer(tokenPairAddress, msg.value);
        HardCoreLike(config.hardCore).transfer(
            tokenPairAddress,
            hardCoreRequired
        );
        uint256 liquidityCreated = config.tokenPair.mint(config.self);

        LockedLP[beneficiary].push(
            LPbatch({
                holder: beneficiary,
                amount: liquidityCreated,
                timestamp: block.timestamp
            })
        );

        emit LPQueued(
            beneficiary,
            liquidityCreated,
            msg.value,
            hardCoreRequired,
            block.timestamp
        );
    }

    //send eth to match with HCORE tokens in LiquidVault
    function purchaseLP() public payable {
       this.purchaseLPFor{value:msg.value}(msg.sender);
    }

    //pops latest LP if older than period
    function claimLP() public returns (bool) {
        uint256 length = LockedLP[msg.sender].length;
        require(length > 0, "HARDCORE: No locked LP.");
        LPbatch memory batch = LockedLP[msg.sender][length - 1];
        require(
            block.timestamp - batch.timestamp > config.stakeDuration,
            "HARDCORE: LP still locked."
        );
        LockedLP[msg.sender].pop();
        uint256 donation = (config.donationShare * batch.amount) / 100;
        emit LPClaimed(msg.sender, batch.amount, block.timestamp, donation);
        require(
            config.tokenPair.transfer(config.donation, donation),
            "HardCore: donation transfer failed in LP claim."
        );
        return config.tokenPair.transfer(batch.holder, batch.amount - donation);
    }

    //allow user to immediately claim the LP from their transaction fee. Ether forwarded depends on user
    function transferGrabLP(address recipient, uint256 value)
        public
        payable
        returns (bool)
    {
        (bool transferSuccess, ) = config.hardCore.delegatecall(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, value)
        );
        //call(abi.encodeWithSignature("transfer(address,uint256)", recipient, value))

        require(transferSuccess, "HARDCORE: transferGrabLP failed on transfer");
        (bool lpPurchaseSuccess, ) = config.self.delegatecall(
            abi.encodePacked(bytes4(keccak256("purchaseLP()")))
        );
        require(
            lpPurchaseSuccess,
            "HARDCORE: transferGrabLP failed on LP purchase"
        );
        return true;
    }

    function lockedLPLength(address holder) public view returns (uint256) {
        return LockedLP[holder].length;
    }

    function getLockedLP(address holder, uint256 position)
        public
        view
        returns (
            address,
            uint256,
            uint256
        )
    {
        LPbatch memory batch = LockedLP[holder][position];
        return (batch.holder, batch.amount, batch.timestamp);
    }
}
