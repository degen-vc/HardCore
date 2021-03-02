// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Hardcore.sol";
import "../facades/FeeDistributorLike.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../PriceOracle.sol";

abstract contract LiquidVaultFacade is Ownable {
    function seed(
        uint32 duration,
        address hcore,
        address feeDistributor,
        address payable ethReceiver,
        uint8 donationShare, // LP Token
        uint8 purchaseFee, // ETH
        address uniswapOracle
    ) public virtual;

    function purchaseLP() public payable virtual;

    function claimLP() public virtual;

    function getLockedLP(address holder, uint256 position)
        public
        view
        virtual
        returns (
            address, //holder
            uint256, //amount
            uint256 //timestamp
        );
}
