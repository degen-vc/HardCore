pragma solidity ^0.6.0;
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

    struct LPbatch {
        address holder;
        uint256 amount;
        uint256 timeStamp;
    }

    struct liquidVaultConfig {
        address hardCore;
        IUniswapV2Router02 uniswapRouter;
        IUniswapV2Pair tokenPair;
        FeeDistributorLike feeDistributor;
        uint256 stakeDuration;
        address self;
        address weth;
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
    mapping(address => LPbatch[]) public LPstakes;

    function seed(
        uint256 duration,
        address hcore,
        address feeDistributor
    ) public {
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
    }

    //send eth to match with HCORE tokens in LiquidVault
    function purchaseLP() public payable lock {
        //fetch HCore from feedistributor
        config.feeDistributor.distributeFees();
        require(msg.value > 0, "HARDCORE: eth required to mint Hardcore LP ");
        //get HCORE swapped for msg.value ->HSWAP
        (address token0, ) = config.hardCore < config.weth
            ? (config.hardCore, config.weth)
            : (config.weth, config.hardCore);
        (uint256 reserve1, uint256 reserve2, ) = config.tokenPair.getReserves();
        uint256 hardCoreRequired = 0;

        if (token0 == config.hardCore) {
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

        //IWETH(WETH).deposit{value : totalETHContributed}();
        IWETH(config.weth).deposit{value: msg.value}();
        address tokenPairAddress = address(config.tokenPair);
        IWETH(config.weth).transfer(tokenPairAddress, msg.value);
        HardCoreLike(config.hardCore).transfer(
            tokenPairAddress,
            hardCoreRequired
        );
        uint256 liquidityCreated = config.tokenPair.mint(config.self);

        LPstakes[msg.sender].push(
            LPbatch({
                holder: msg.sender,
                amount: liquidityCreated,
                timeStamp: block.timestamp
            })
        );

        emit LPQueued(
            msg.sender,
            liquidityCreated,
            msg.value,
            hardCoreRequired,
            block.timestamp
        );
    }

    //pops latest LP if older than period
    function claimLP() public {}

    function transferClaim(address reipient, uint256 value) public {
        //delegate call I guess
    }
}
