// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // for WETH
import "@nomiclabs/buidler/console.sol";
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';

contract FeeApprover is Ownable {
    using SafeMath for uint256;

    function initialize(
        address _HCAddress,
        address _uniswapFactory,
        address WETHAddress,
        address _liquidVault
    ) public{
        hardcoreTokenAddress = _HCAddress;
        tokenUniswapPair = IUniswapV2Factory(_uniswapFactory).getPair(WETHAddress,_HCAddress);
        feePercentX100 = 10;
        paused = true; 
        _setFeeDiscountTo(tokenUniswapPair, 1000);
        _setFeeDiscountFrom(tokenUniswapPair, 1000);
    }


    address tokenUniswapPair;
    IUniswapV2Factory public uniswapFactory;
    address hardcoreTokenAddress;
    address liquidVault;
    uint8 public feePercentX100;  // max 255 = 25.5% artificial clamp
    uint256 public lastTotalSupplyOfLPTokens;
    bool paused;
    mapping (address => uint) public discountFrom;
    mapping (address => uint) public discountTo;
    mapping (address => uint) public feeBlackList;

    // Once HCore is unpaused, it can never be paused
    function unPause() public onlyOwner {
        paused = false;
    }

    function setFeeMultiplier(uint8 _feeMultiplier) public onlyOwner {
        feePercentX100 = _feeMultiplier;
    }

     function setFeeBlackList(address _address, uint feeAmount) public onlyOwner {
        feeBlackList[_address] = feeAmount; 
    }//TODO:implement this in fee calculations

    function setFeeDiscountTo(address _address, uint discount) public onlyOwner {
        _setFeeDiscountTo(_address,discount);
    }
    function _setFeeDiscountTo(address _address, uint discount) internal{
        require (discount<=1000, "HARDCORE: discount expressed as percentage between 0 and 1000");
        discountTo[_address] = discount;
    }

    function setFeeDiscountFrom(address _address, uint discount) public onlyOwner {
        _setFeeDiscountFrom(_address,discount);
    }
    function _setFeeDiscountFrom(address _address, uint discount) internal{
        require (discount<=1000, "HARDCORE: discount expressed as percentage between 0 and 1000");
        discountTo[_address] = discount;
    }

    function calculateAmountsAfterFee(        
        address sender, 
        address recipient,
        uint256 amount
        ) public  returns (uint256 transferToAmount, uint256 transferToFeeDistributorAmount) 
        {
          require(!paused, "HARDCORE: system not yet initialized");
          uint fee = amount.mul(feePercentX100).div(100);
          uint totalDiscount = discountFrom[sender].mul(amount).div(1000) + discountTo[recipient].mul(amount).div(1000);
          fee = totalDiscount>fee?0:fee-totalDiscount;

          return (amount - fee, fee);
        }


}
