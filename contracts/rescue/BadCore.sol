// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../facades/FeeApproverLike.sol";
import "@nomiclabs/buidler/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "../facades/LiquidVaultLike.sol";

contract FakePair  {

}

contract FakeWeth {
    
}


contract FakeRouter {
    address public WETH;
    constructor(address weth) public {
        WETH = weth;
    }
}
contract BadCore {

    address public uniswapRouter;
    address public tokenUniswapPair;

    constructor() public{
        tokenUniswapPair = address(new FakePair());
        address weth = address(new FakeWeth());
        uniswapRouter = address(new FakeRouter(weth));
    }
}