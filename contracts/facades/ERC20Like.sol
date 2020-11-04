// SPDX-License-Identifier: MIT
pragma solidity ^0.6.1;

abstract contract ERC20Like {
    function totalSupply() external view virtual returns (uint256);

    function balanceOf(address account) external view virtual returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        virtual
        returns (bool);

    function allowance(address owner, address spender)
        external
        view
        virtual
        returns (uint256);

    function approve(address spender, uint256 amount)
        external
        virtual
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external virtual returns (bool);

    function name() public view virtual returns (string memory);

    function symbol() public view virtual returns (string memory);

    function decimals() public view virtual returns (uint8);
}
