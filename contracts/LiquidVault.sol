// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./facades/FeeDistributorLike.sol";
import "./facades/ERC20Like.sol";
import "./PriceOracle.sol";

contract LiquidVault is Ownable {
  /** Emitted when purchaseLP() is called to track ETH amounts */
  event EthTransferred(
      address from,
      uint amount,
      uint percentageAmount
  );

  /** Emitted when purchaseLP() is called and LP tokens minted */
  event LPQueued(
      address holder,
      uint amount,
      uint eth,
      uint hardcoreToken,
      uint timestamp
  );

  /** Emitted when claimLP() is called */
  event LPClaimed(
      address holder,
      uint amount,
      uint timestamp,
      uint exitFee,
      bool claimed
  );

  struct LPbatch {
      address holder;
      uint amount;
      uint timestamp;
      bool claimed;
  }

  struct LiquidVaultConfig {
      address hardcoreToken;
      IUniswapV2Router02 uniswapRouter;
      IUniswapV2Pair tokenPair;
      FeeDistributorLike feeDistributor;
      PriceOracle uniswapOracle;
      address weth;
      address payable feeReceiver;
      uint32 stakeDuration;
      uint8 donationShare; //0-100
      uint8 purchaseFee; //0-100
  }
  
  bool public forceUnlock;
  bool private locked;

  modifier lock {
      require(!locked, "LiquidVault: reentrancy violation");
      locked = true;
      _;
      locked = false;
  }

  LiquidVaultConfig public config;

  mapping(address => LPbatch[]) public lockedLP;
  mapping(address => uint) public queueCounter;

  function seed(
      uint32 duration,
      address hardcoreToken,
      address uniswapPair,
      address uniswapRouter,
      address feeDistributor,
      address payable feeReceiver,
      uint8 donationShare, // LP Token
      uint8 purchaseFee, // ETH
      address uniswapOracle
  ) public onlyOwner {
      config.hardcoreToken = hardcoreToken;
      config.uniswapRouter = IUniswapV2Router02(uniswapRouter);
      config.tokenPair = IUniswapV2Pair(uniswapPair);
      config.feeDistributor = FeeDistributorLike(feeDistributor);
      config.weth = config.uniswapRouter.WETH();
      config.uniswapOracle = PriceOracle(uniswapOracle);
      setFeeReceiverAddress(feeReceiver);
      setParameters(duration, donationShare, purchaseFee);
  }

  function getStakeDuration() public view returns (uint) {
      return forceUnlock ? 0 : config.stakeDuration;
  }

  // Could not be canceled if activated
  function enableLPForceUnlock() public onlyOwner {
      forceUnlock = true;
  }

  function setOracleAddress(PriceOracle _uniswapOracle) external onlyOwner {
        require(address(_uniswapOracle) != address(0), "Zero address not allowed");
        config.uniswapOracle = _uniswapOracle;
    }


  function setFeeReceiverAddress(address payable feeReceiver) public onlyOwner {
      require(
          feeReceiver != address(0),
          "LiquidVault: ETH receiver is zero address"
      );

      config.feeReceiver = feeReceiver;
  }

  function setParameters(uint32 duration, uint8 donationShare, uint8 purchaseFee)
      public
      onlyOwner
  {
      require(
          donationShare <= 100,
          "LiquidVault: donation share % between 0 and 100"
      );
      require(
          purchaseFee <= 100,
          "LiquidVault: purchase fee share % between 0 and 100"
      );

      config.stakeDuration = duration * 1 hours;
      config.donationShare = donationShare;
      config.purchaseFee = purchaseFee;
  }

  function purchaseLPFor(address beneficiary) public payable lock {
      config.feeDistributor.distributeFees();
      require(msg.value > 0, "LiquidVault: ETH required to mint HCORE LP");

      uint feeValue = (config.purchaseFee * msg.value) / 100;
      uint exchangeValue = msg.value - feeValue;

      (uint reserve1, uint reserve2, ) = config.tokenPair.getReserves();

      uint hardcoreRequired;

      if (address(config.hardcoreToken) < address(config.weth)) {
          hardcoreRequired = config.uniswapRouter.quote(
              exchangeValue,
              reserve2,
              reserve1
          );
      } else {
          hardcoreRequired = config.uniswapRouter.quote(
              exchangeValue,
              reserve1,
              reserve2
          );
      }

      uint balance = ERC20Like(config.hardcoreToken).balanceOf(address(this));
      require(
          balance >= hardcoreRequired,
          "LiquidVault: insufficient HCORE tokens in LiquidVault"
      );

      IWETH(config.weth).deposit{ value: exchangeValue }();
      address tokenPairAddress = address(config.tokenPair);
      IWETH(config.weth).transfer(tokenPairAddress, exchangeValue);
      ERC20Like(config.hardcoreToken).transfer(
          tokenPairAddress,
          hardcoreRequired
      );

      uint liquidityCreated = config.tokenPair.mint(address(this));
      config.feeReceiver.transfer(feeValue);
      config.uniswapOracle.update();

      lockedLP[beneficiary].push(
          LPbatch({
              holder: beneficiary,
              amount: liquidityCreated,
              timestamp: block.timestamp,
              claimed: false
          })
      );

      emit LPQueued(
          beneficiary,
          liquidityCreated,
          exchangeValue,
          hardcoreRequired,
          block.timestamp
      );

      emit EthTransferred(msg.sender, exchangeValue, feeValue);
  }

  //send ETH to match with HCORE tokens in LiquidVault
  function purchaseLP() public payable {
      purchaseLPFor(msg.sender);
  }

  function claimLP() public {
      uint next = queueCounter[msg.sender];
      require(
          next < lockedLP[msg.sender].length,
          "LiquidVault: nothing to claim."
      );
      LPbatch storage batch = lockedLP[msg.sender][next];
      require(
          block.timestamp - batch.timestamp > getStakeDuration(),
          "LiquidVault: LP still locked."
      );
      next++;
      queueCounter[msg.sender] = next;
      uint donation = (config.donationShare * batch.amount) / 100;
      batch.claimed = true;
      emit LPClaimed(msg.sender, batch.amount, block.timestamp, donation, batch.claimed);
      require(
          config.tokenPair.transfer(address(0), donation),
          "LiquidVault: donation transfer failed in LP claim."
      );
      require(
          config.tokenPair.transfer(batch.holder, batch.amount - donation),
          "LiquidVault: transfer failed in LP claim."
      );
  }

  function lockedLPLength(address holder) public view returns (uint) {
      return lockedLP[holder].length;
  }

  function getLockedLP(address holder, uint position)
      public
      view
      returns (
          address,
          uint,
          uint,
          bool
      )
  {
      LPbatch memory batch = lockedLP[holder][position];
      return (batch.holder, batch.amount, batch.timestamp, batch.claimed);
  }
}