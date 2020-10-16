pragma solidity ^0.6.0;

abstract contract LiquidVaultLike {
    function purchaseLP() public virtual;
    function claimLP () public virtual;
}