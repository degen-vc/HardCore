// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./INFTFund.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IUniswapV2Pair } from "./testing/uniswapv2/interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Router01 } from "./testing/uniswapv2/interfaces/IUniswapV2Router01.sol";
import { IUniswapV2Router02 } from "./testing/uniswapv2/interfaces/IUniswapV2Router02.sol";
import { TransferHelper } from "./testing/uniswapv2/libraries/TransferHelper.sol";
import { UniswapV2Factory } from "./testing/uniswapv2/UniswapV2Factory.sol";
import { UniswapV2Library } from "./testing/uniswapv2/libraries/UniswapV2Library.sol";

contract NFTFund is INFTFund, Ownable {
    // @dev deposit tokens to NFT fund (all erc20.approve before)

    address factory;
    address router;
    IERC20 token;
    address distributor;

    uint delayTime = 5 days; // 5 days default

    mapping (address => uint) public balances;
    mapping (address => uint) public delayed;

    constructor(UniswapV2Factory uniFactory, address uniRouterV2, IERC20 itsHardFCore, address _distributor) public {
        factory = address(UniswapV2Factory(uniFactory));
        router = uniRouterV2;
        token = itsHardFCore;
        distributor = _distributor;
    }

    function getReserves(address tokenA, address tokenB) public view returns(uint256 reserve0, uint256 reserve1) {
        IUniswapV2Pair _pair = IUniswapV2Pair(UniswapV2Library.pairFor(factory, tokenA, tokenB));
        (reserve0, reserve1,) = _pair.getReserves();
        return (reserve0, reserve1);
    }

    function deposit(address user, uint amount) external override onlyDistributor {
        balances[user] = amount;
    }

    // @dev sell HCORE token for ETH on uniswap
    function sellToken() external override {
        uint amountIn;
        if (msg.sender == owner()) {
            amountIn = balances[address(0)] + balances[owner()];
        } else {
            amountIn = balances[msg.sender];
        }

        address tokenIn = address(token);
        address tokenOut = IUniswapV2Router01(router).WETH();

        (uint reserveA, uint reserveB) = getReserves(tokenIn, tokenOut);

        uint amountOut = IUniswapV2Router02(router).getAmountOut(amountIn, reserveA, reserveB);

        TransferHelper.safeApprove(tokenIn, address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint[] memory amounts = IUniswapV2Router01(router).swapExactTokensForTokens(
            amountIn,
            amountOut,
            path,
            msg.sender, // to this contract
            block.timestamp
        );
    }

    function setDelayTime(uint _seconds) external onlyOwner {
        delayTime = _seconds;
    }

    // TODO: add token withdraw

    function withdraw() external override /*isDelayed*/ onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    modifier onlyDistributor() {
        require(msg.sender == distributor, "Withdraw locked.");
        _;
    }

    modifier isDelayed() {
        require(delayed[msg.sender] + delayTime < block.timestamp, "Withdraw locked.");
        _;
    }

}