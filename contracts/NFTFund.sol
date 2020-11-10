// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./testing/uniswapv2/libraries/UniswapV2Library.sol";
import "./testing/uniswapv2/libraries/TransferHelper.sol";

contract NFTFund is Ownable {
    using SafeMath for uint256;

    event TokensForEthSwapped(uint256 tokenAmount, uint256 weiBalanceAfterSwap, address indexed from);
    event TokenWithdrawn(uint256 tokenAmount, address indexed token, address indexed to);
    event EthWithdrawn(uint256 weiAmount, address indexed to);

    IUniswapV2Factory public uniswapFactory;
    IUniswapV2Router02 public router;

    IERC20 public token;

    constructor(IUniswapV2Factory _factory, IUniswapV2Router02 _router,  IERC20 _token) public {
        require(
            address(_factory) != address(0) && 
            address(_router) != address(0) && 
            address(_token) != address(0),
            "NFTFund: factory, router and token are zero addresses"
        );
        uniswapFactory = _factory;
        token = _token;
        router = _router;
    }

    receive() external payable {
        assert(msg.sender == address(router));
    }

    function getTokenBalance() public view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function swapTokensForETH() external {
        uint amountToSwap = getTokenBalance();
        _swapTokensForETH(address(token), amountToSwap, 0, block.timestamp);
    }

    function swapTokensForETH(uint256 amountToSwap) external {
        require(
            amountToSwap <= getTokenBalance(),
            "NFTFund: token amount exeeds balance"
        );

        _swapTokensForETH(address(token), amountToSwap, 0, block.timestamp);
    }

    function withdrawETH() external onlyOwner {
        uint256 weiAmount = address(this).balance;
        _withdrawETH(weiAmount, msg.sender);
    }

    function withdrawETH(uint256 weiAmount) external onlyOwner {
        _withdrawETH(weiAmount, msg.sender);
    }

    function withdrawTokens() external onlyOwner {
        uint256 tokenAmount = getTokenBalance();
        _withdrawTokens(tokenAmount, address(token), msg.sender);
    }

    function withdrawTokens(uint256 tokenAmount) external onlyOwner {
        _withdrawTokens(tokenAmount, address(token), msg.sender);
    }

    function _swapTokensForETH(address _token, uint _amountIn, uint _amountOutMin, uint _deadline)
        internal
    {
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = router.WETH();
        TransferHelper.safeApprove(address(token), address(router), _amountIn);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            _amountIn,
            _amountOutMin,
            path,
            address(this),
            _deadline
        );
        uint256 weiBalanceAfterSwap = address(this).balance;

        emit TokensForEthSwapped(_amountIn, weiBalanceAfterSwap, msg.sender);
    }

    function _withdrawTokens(uint256 _tokenAmount, address _token, address _to) internal {
        require(_tokenAmount > 0, "NFTFund: HCORE amount should be > 0");
        require(
            _tokenAmount <= getTokenBalance(),
            "NFTFund: token amount exeeds balance"
        );

        IERC20(_token).transfer(_to, _tokenAmount);
        emit TokenWithdrawn(_tokenAmount, _token, _to);
    }

    function _withdrawETH(uint256 _weiAmount, address payable _to) internal {
        require(_weiAmount > 0, "NFTFund: ETH amount should be > 0");
        require(_weiAmount <= address(this).balance, "NFTFund: wei amount exeeds balance");

        _to.transfer(_weiAmount);
        emit EthWithdrawn(_weiAmount, _to);
    }
}