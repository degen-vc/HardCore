# HardCore

Features of Hardcore: ERC20
transfer charges a fee; can be changed

On deployment HardCore automatically creates the LP on uniswap. 
After deploy HardCore is paused. Any transfers will fail. Once unpaused, it can never be paused again

Addresses can be white/blacklisted with their own personalized fee that supersedes the default
Addresses can be given a discount on the fee on both sending to an address and sending from an address. The discount is a percentage from 0-100%

Fee revenue is sent to a distributor contract

TransferGrab executes transfer, forwards eth from user (any eth amount the user wishes) and immediately uses the Eth to lock LP in liquidVault

Distributor features:
A share percentage defines what percentage of fees belong to LiquidVault. The balance goes to NFTfund.
distributeFees() is a public function that splits and sends current Hcore balance

LiquidVault features:
purchaseLP takes an eth value, looks at uniswap and estimates the required Hcore for the given eth. If it has enough Hcore, it creates an LP token and locks for user for a X days. X can be set at any time.

PurchaseLPFor allows anyone to lock LP in the name of a beneficiary who can claim it after X days. This method is used in Hcore.transferGrab but can be used in other applications if desired.

Claim will release the latest LP locked if it is due, otherwise fails.

On claim, liquid vault sends a portion of LP to a donation address
