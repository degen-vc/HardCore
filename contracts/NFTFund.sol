// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./INFTFund.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IUniswapV2Pair } from "./testing/uniswapv2/interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Router01 } from "./testing/uniswapv2/interfaces/IUniswapV2Router01.sol";
import { IUniswapV2Router02 } from "./testing/uniswapv2/interfaces/IUniswapV2Router02.sol";
import { TransferHelper } from "./testing/uniswapv2/libraries/TransferHelper.sol";
import { UniswapV2Factory } from "./testing/uniswapv2/UniswapV2Factory.sol";
import { UniswapV2Library } from "./testing/uniswapv2/libraries/UniswapV2Library.sol";

/*
 * Contract Simple sell of token
 */
contract NFTFund is INFTFund, Ownable {
    using SafeMath for uint256;

    event Deposited(address from, uint256 amount);
    event Trade(uint256 tokens, uint256 toWETH);
    event Withdrawn(address token, address to, uint256 amount);

    address factory;
    address router;
    IERC20 token;
    address distributor;

    uint256 public totalRaised;
    uint256 public totalExchangedWETH;

    constructor(
        UniswapV2Factory uniFactory,
        address uniRouterV2,
        IERC20 _hardCoreToken,
        address _distributor
    ) public {
        factory = address(UniswapV2Factory(uniFactory));
        router = uniRouterV2;
        token = _hardCoreToken;
        distributor = _distributor;
    }

    function getReserves(address tokenA, address tokenB)
        public
        view
        returns (uint256 reserve0, uint256 reserve1)
    {
        IUniswapV2Pair _pair = IUniswapV2Pair(
            UniswapV2Library.pairFor(factory, tokenA, tokenB)
        );
        (reserve0, reserve1, ) = _pair.getReserves();
        return (reserve0, reserve1);
    }

    // @dev deposit tokens to NFT fund (all erc20.approve before)
    function deposit(uint256 amount) external override onlyDistributor {
        totalRaised = totalRaised.add(amount);
        emit Deposited(msg.sender, amount);
    }

    function sellToken(uint256 amountIn) external override {
        require(
            amountIn <= token.balanceOf(address(this)),
            "Not enough balance"
        );

        _sellToken(amountIn);
    }

    function sellToken() external override {
        uint256 amountIn = token.balanceOf(address(this));

        _sellToken(amountIn);
    }

    // @dev sell HCORE token for ETH on uniswap
    function _sellToken(uint256 amountIn) internal {
        address tokenIn = address(token);
        address tokenOut = IUniswapV2Router01(router).WETH();

        (uint256 reserveA, uint256 reserveB) = getReserves(tokenIn, tokenOut);

        uint256 amountOut = IUniswapV2Router02(router).getAmountOut(
            amountIn,
            reserveA,
            reserveB
        );

        TransferHelper.safeApprove(tokenIn, address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = IUniswapV2Router01(router)
            .swapExactTokensForTokens(
            amountIn,
            amountOut,
            path,
            address(this), // to this contract
            block.timestamp
        );

        totalExchangedWETH = totalExchangedWETH.add(
            amounts[amounts.length - 1]
        );

        emit Trade(amounts[0], amounts[amounts.length - 1]);
    }

    function withdrawToken(address _token, address _to, uint _amount)
        external
        onlyOwner
    {
        _withdrawToken(_token, _to, _amount);
    }

    function withdrawToken(address _token) external override onlyOwner {
        uint amount = token.balanceOf(address(this));
        _withdrawToken(_token, owner(), amount);
    }

    function _withdrawToken(address _token, address _to, uint256 _amount) internal {
        require(_amount > 0, "Contract is empty");

        IERC20(_token).transfer(_to, _amount);
        emit Withdrawn(_token, _to, _amount);
    }

    modifier onlyDistributor() {
        require(msg.sender == distributor, "NFTFund: Only distributor");
        _;
    }
}
