// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface INFTFund {
    // @dev deposit tokens to NFT fund (all erc20.approve before)
    function deposit(uint256 amount) external; // erc20.transferFrom

    // @dev sell HCORE token for ETH on uniswap
    function sellToken() external;

    // @dev sell HCORE token for ETH on uniswap, with limit amount
    function sellToken(uint256 amountIn) external;

    // @dev claim eth for the owner
    function withdraw() external;

    // @dev claim token for the owner
    function withdrawToken(address erc20Token) external;
}
