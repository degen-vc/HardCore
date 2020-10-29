// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface INFTFund {
    // @dev deposit tokens to NFT fund (all erc20.approve before)
    function deposit(address who, uint amount) external; // erc20.transferFrom

    // @dev sell HCORE token for ETH on uniswap
    function sellToken() external;

    // @dev claim eth for the owner
    function withdraw() external;
}
