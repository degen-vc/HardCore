pragma solidity ^0.6.0;
import "./ERC20Like.sol";

abstract contract UniswapRouterLike{
    function WETH() public virtual returns (ERC20Like);
}