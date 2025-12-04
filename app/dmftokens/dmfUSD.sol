// SPDX-License-Identifier: BUSL-1.1

/*
Business Source License 1.1

Parameters
Licensor:              Digital Monetary Framework [DMF]
Licensed Work:         dmfUSD Smart Contracts
Additional Use Grant:  You may make use of the Licensed Work for auditing, testing, and non-production purposes only.
Change Date:           2030-11-24
Change License:        Apache License, Version 2.0

For information about alternative licensing arrangements for the Licensed Work,
please contact: hi@dmfam.org

Full license text: https://mariadb.com/bsl11/
*/

pragma solidity 0.8.30;

import "@openzeppelin/contracts@4.9.3/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@4.9.3/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@4.9.3/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts@4.9.3/utils/Address.sol";
import "@openzeppelin/contracts@4.9.3/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts@4.9.3/access/Ownable2Step.sol";
import "@openzeppelin/contracts@4.9.3/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts@4.9.3/utils/math/Math.sol";

/**
 * @title dmfUSD
 * @author Digital Monetary Framework [DMF]
 * @notice A USDC utility token-backed token with fair dividend distribution and refund mechanism
 * 
 * Key Features:
 * - Native USDC (utility token) backed with 100% effective backing
 * - 6 decimal places for internal calculations (1 dmfUSD = 1,000,000 units)
 * - Fair dividend distribution to EOA users only (contracts auto-excluded)
 * - Direct refund mechanism at backing value
 * - Controlled token burning (max 20% of total supply)
 * - Fee structure: dev (0.05%), dividend (0.05-0.1%), reserve (0.07.5-0.15%), burn (0.07.5% when below limit)
 * - Dynamic pricing creates forced growth with USD stability
 * 
 * Security Features:
 * - ReentrancyGuard protection on all external calls
 * - OpenZeppelin battle-tested contracts
 * - Native USDC transfers (utility token on ARC)
 * - Automatic contract detection for dividend exclusions
 * - Precise fee calculations using Math.mulDiv
 * 
 */

contract dmfUSD is ReentrancyGuard, ERC20, ERC20Permit, Ownable2Step {
    // Reserve tracking (USDC utility token - native on ARC, tracked in 6 decimals)
    uint256 public usdcReserves;

    uint256 public immutable TOTAL_SUPPLY;
    uint256 public immutable BURNING_LIMIT;
    uint256 public immutable MINIMUM_PURCHASE_USDC;
    uint256 private immutable BASE_PRICE;
    uint256 private constant PRECISION_DIVISOR = 10000;

    uint256 private constant EFFECTIVE_BACKING_NUMERATOR = 999;
    uint256 private constant EFFECTIVE_BACKING_DENOMINATOR = 1000;

    uint256 private immutable BUY_DEV_FEE_BPS;
    uint256 private immutable BUY_RESERVE_FEE_BPS;
    uint256 private immutable BUY_REFLECTION_FEE_BPS;
    
    uint256 private immutable REFUND_DEV_FEE_BPS;
    uint256 private immutable REFUND_REFLECTION_FEE_BPS;
    
    uint256 private immutable TRANSFER_DEV_FEE_BPS;
    uint256 private immutable TRANSFER_REFLECTION_FEE_BPS;
    uint256 private immutable TRANSFER_RESERVE_FEE_BPS;
    
    uint256 private immutable DEX_SWAP_DEV_FEE_BPS;
    uint256 private immutable DEX_SWAP_REFLECTION_FEE_BPS;
    uint256 private immutable DEX_SWAP_RESERVE_FEE_BPS;

    uint256 public totalBurned;
    uint256 public tokensSold;
    address private devAddress;
    
    uint256 private constant MAGNITUDE = 2**128;
    uint256 private magnifiedDividendPerShare;
    uint256 private totalDividendsDistributed;
    
    mapping(address => uint256) private lastDividendPerShare;
    mapping(address => uint256) private accumulatedDividends;
    
    mapping(address => bool) private _isExcludedFromFee;
    
    mapping(address => bool) private _isLiquidityPair;
    mapping(address => bool) private _isNotLiquidityPair;

    error dmfUSDAddress();
    error dmfUSDAmount();
    error InsufficientBalance();
    error InsufficientUSDC();
    error NoTokensInCirculation();
    error USDCTransferFailed();
    error DividendsOverflow();

    enum SwapType { BUY, SELL }
    enum ExemptionReason { REFUND, EXCLUDED_ADDRESS }

    event Buy(address indexed buyer, uint256 usdcPaid, uint256 tokensReceived);
    event Refund(address indexed refunder, uint256 tokensRefunded, uint256 usdcReceived);
    event TransferFeeApplied(address indexed from, address indexed to, uint256 originalAmount, uint256 devFee, uint256 reflectionFee, uint256 reserveFee, uint256 netAmount);
    event SwapFeeApplied(SwapType swapType, address indexed user, uint256 originalAmount, uint256 devFee, uint256 reflectionFee, uint256 reserveFee, uint256 netAmount);
    event TransferFeeExempt(address indexed from, address indexed to, uint256 amount, ExemptionReason reason);
    event DividendsDistributed(uint256 amount, uint256 magnifiedDividendPerShare);
    event DividendWithdrawn(address indexed user, uint256 amount);
    event LiquidityPairDetected(address indexed pair);
    event DevAddressChanged(address indexed oldDevAddress, address indexed newDevAddress);
    event FeeExclusionSet(address indexed account, bool isExcluded);

    /**
     * @notice Constructor for dmfUSD token
     * @param _initialOwner Address that will receive initial ownership
     * @param _devAddress Address that will receive development fees
     * @dev Token has 6 decimals for internal calculations
     * @dev Total supply: 100 billion tokens (100,000,000,000 * 10^6)
     * @dev Uses native USDC (utility token) on ARC network for backing
     */
    constructor(
        address _initialOwner, 
        address _devAddress
    ) 
        ERC20("dmfUSD", "dmfUSD") 
        ERC20Permit("dmfUSD") 
        Ownable() 
    {
        if (_initialOwner == address(0)) revert dmfUSDAddress();
        if (_devAddress == address(0)) revert dmfUSDAddress();

        // 6 decimals: 100 billion tokens = 100,000,000,000 * 10^6
        TOTAL_SUPPLY = 100000000000 * 1e6;
        BURNING_LIMIT = TOTAL_SUPPLY / 5; 
        
        // 6 decimals: Minimum purchase 0.1 USDC = 100,000 (0.1 * 10^6) = $0.1
        MINIMUM_PURCHASE_USDC = 1e5; // 0.1 USDC
        // 1:1 ratio at launch: 1 USDC = 1 dmfUSD (both 6 decimals)
        BASE_PRICE = 1e6; // 1 USDC per token

        BUY_DEV_FEE_BPS = 5;
        BUY_RESERVE_FEE_BPS = 10;
        BUY_REFLECTION_FEE_BPS = 10;
        
        REFUND_DEV_FEE_BPS = 5;   
        REFUND_REFLECTION_FEE_BPS = 5; 
        
        TRANSFER_DEV_FEE_BPS = 5;
        TRANSFER_REFLECTION_FEE_BPS = 10;
        TRANSFER_RESERVE_FEE_BPS = 10;
        
        // DEX swap fees are always 0 - DEX swaps bypass fee logic entirely in _handleTaxedTransfer
        DEX_SWAP_DEV_FEE_BPS = 0;
        DEX_SWAP_REFLECTION_FEE_BPS = 0;
        DEX_SWAP_RESERVE_FEE_BPS = 0;

        devAddress = _devAddress;

        // Mint total supply to contract
        _mint(address(this), TOTAL_SUPPLY);
        
        _isExcludedFromFee[address(this)] = true;
        _isExcludedFromFee[_initialOwner] = true;
        _isExcludedFromFee[devAddress] = true;
        
        _transferOwnership(_initialOwner);
    }

    /**
     * @notice Override decimals to return 6 (matching USDC)
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account);
    }

    function totalSupply() public view override returns (uint256) {
        return TOTAL_SUPPLY - totalBurned;
    }
    
    /**
     * @notice Buy dmfUSD tokens with native USDC (utility token)
     * @dev User sends native USDC via msg.value (18 decimals on ARC)
     * @dev Converts to 6 decimals for internal calculations
     */
    function buy() external payable nonReentrant {
        // Convert from 18 decimals (native) to 6 decimals (internal)
        uint256 usdcAmount = msg.value / 1e12; // Divide by 1e12 to convert 18->6 decimals
        
        if (usdcAmount < MINIMUM_PURCHASE_USDC) revert InsufficientUSDC();
        
        // Update reserves before calling _buy
        usdcReserves += usdcAmount;
        
        _buy(msg.sender, usdcAmount);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        // Update dividend tracking before balance changes
        if (from != address(0) && !isContract(from)) {
            _updateUserDividendTracking(from);
        }
        
        if (to != address(0) && !isContract(to)) {
            _updateUserDividendTracking(to);
        }
        
        _update(from, to, amount);
    }

    function _update(address from, address to, uint256 amount) private {
        if (from == address(0)) revert dmfUSDAddress();
        if (to == address(0)) revert dmfUSDAddress();
        if (amount == 0) revert dmfUSDAmount();

        bool isExempt = _isExcludedFromFee[from] || _isExcludedFromFee[to];

        if (to == address(this)) {
            super._transfer(from, to, amount);
            _handleRefund(from, amount);
            emit TransferFeeExempt(from, to, amount, ExemptionReason.REFUND);
        } else if (isExempt) {
            super._transfer(from, to, amount);
            emit TransferFeeExempt(from, to, amount, ExemptionReason.EXCLUDED_ADDRESS);
        } else {
            _handleTaxedTransfer(from, to, amount);
        }
    }
    
    function isLiquidityPair(address addr) internal returns (bool) {
        if (addr.code.length == 0) {
            return false;
        }
        if (_isLiquidityPair[addr]) return true;
        if (_isNotLiquidityPair[addr]) return false;

        (bool s0, bytes memory d0) = addr.staticcall(abi.encodeWithSignature("token0()"));
        (bool s1, bytes memory d1) = addr.staticcall(abi.encodeWithSignature("token1()"));

        if (s0 && s1 && d0.length == 32 && d1.length == 32) {
            address token0 = abi.decode(d0, (address));
            address token1 = abi.decode(d1, (address));
            if ((token0 == address(this) || token1 == address(this)) && token0 != token1) {
                _cacheLiquidityPair(addr);
                return true;
            }
        }

        _isNotLiquidityPair[addr] = true;
        return false; 
    }

    function _cacheLiquidityPair(address addr) private {
        _isLiquidityPair[addr] = true;
        emit LiquidityPairDetected(addr);
    }

    function _handleTaxedTransfer(address from, address to, uint256 amount) private {
        if (balanceOf(from) < amount) revert InsufficientBalance();

        bool isDexSwap = (isContract(from) && isLiquidityPair(from)) || (isContract(to) && isLiquidityPair(to));

        // DEX swaps are always fee-free - bypass all fee logic
        if (isDexSwap) {
            // Direct transfer with no fees for DEX swaps
            super._transfer(from, to, amount);
            
            bool isSell = isContract(to) && isLiquidityPair(to);
            address user = isSell ? from : to;
            emit SwapFeeApplied(isSell ? SwapType.SELL : SwapType.BUY, user, amount, 0, 0, 0, amount);
            return;
        }

        // Regular transfers apply fees
        uint256 devFee = Math.mulDiv(amount, TRANSFER_DEV_FEE_BPS, 10000);
        uint256 reflectionFee = Math.mulDiv(amount, TRANSFER_REFLECTION_FEE_BPS, 10000);
        uint256 reserveFee = Math.mulDiv(amount, TRANSFER_RESERVE_FEE_BPS, 10000);
        uint256 netAmount;
        unchecked {
            netAmount = amount - devFee - reflectionFee - reserveFee;
        }

        super._transfer(from, address(this), amount);
        
        // Distribute dividends before transferring to recipient
        // This prevents the recipient from earning dividends on newly received tokens from this transfer
        _distributeDividends(reflectionFee);
        
        if (netAmount != 0) {
            super._transfer(address(this), to, netAmount);
        }
        if (devFee != 0) {
            super._transfer(address(this), devAddress, devFee);
        }

        emit TransferFeeApplied(from, to, amount, devFee, reflectionFee, reserveFee, netAmount);
    }
    
    function _buy(address buyer, uint256 usdcAmount) private {
        // Note: nonReentrant is on the public buy() function
        // usdcAmount is already added to usdcReserves in public buy()
        
        uint256 balanceBefore = usdcReserves - usdcAmount;
        uint256 tokensToPurchase = _getTokensForUsdc(usdcAmount, balanceBefore);

        if (tokensToPurchase == 0) revert InsufficientUSDC();
        if (tokensSold + tokensToPurchase > TOTAL_SUPPLY) revert InsufficientBalance();

        uint256 devFee = Math.mulDiv(tokensToPurchase, BUY_DEV_FEE_BPS, 10000);
        uint256 reserveFee = Math.mulDiv(tokensToPurchase, BUY_RESERVE_FEE_BPS, 10000);
        uint256 reflectionFee = Math.mulDiv(tokensToPurchase, BUY_REFLECTION_FEE_BPS, 10000);
        uint256 tokensToUser;
        unchecked {
            tokensToUser = tokensToPurchase - devFee - reserveFee - reflectionFee;
        }

        tokensSold = tokensSold + tokensToPurchase;
        
        // Accumulate dividends from user's existing balance before buy fee distribution
        // This accumulates any pending dividends from previous transactions
        uint256 buyerBalanceBefore = 0;
        if (!isContract(buyer)) {
            buyerBalanceBefore = balanceOf(buyer);
            if (buyerBalanceBefore > 0) {
                uint256 currentDividendPerShare = magnifiedDividendPerShare;
                uint256 lastBuyerDividendPerShare = lastDividendPerShare[buyer];
                
                // Calculate and accumulate dividends from existing balance (pending from previous transactions)
                if (currentDividendPerShare > lastBuyerDividendPerShare) {
                    uint256 dividendDifference = currentDividendPerShare - lastBuyerDividendPerShare;
                    uint256 newDividends = (buyerBalanceBefore * dividendDifference) / MAGNITUDE;
                    
                    if (newDividends > 0) {
                        accumulatedDividends[buyer] += newDividends;
                    }
                }
            }
        }

        // Distribute dividends from buy fee before transferring tokens to buyer
        // This prevents the buyer from earning dividends on newly purchased tokens from their own buy fee
        _distributeDividends(reflectionFee);
        
        // Accumulate dividends from existing balance after buy fee distribution
        // This ensures the existing balance earns dividends from the buy fee that was just distributed
        if (!isContract(buyer) && buyerBalanceBefore > 0) {
            uint256 dividendPerShareAfterDistribution = magnifiedDividendPerShare;
            uint256 lastBuyerDividendPerShare = lastDividendPerShare[buyer];
            
            // Calculate and accumulate dividends from existing balance (from the buy fee just distributed)
            if (dividendPerShareAfterDistribution > lastBuyerDividendPerShare) {
                uint256 dividendDifference = dividendPerShareAfterDistribution - lastBuyerDividendPerShare;
                uint256 newDividends = (buyerBalanceBefore * dividendDifference) / MAGNITUDE;
                
                if (newDividends > 0) {
                    accumulatedDividends[buyer] += newDividends;
                }
            }
        }
        
        // Mark buyer as "caught up" to current dividend distribution
        // This prevents them from retroactively earning dividends from their own purchase
        if (!isContract(buyer)) {
            lastDividendPerShare[buyer] = magnifiedDividendPerShare;
        }
        
        super._transfer(address(this), devAddress, devFee);
        super._transfer(address(this), buyer, tokensToUser);

        emit Buy(buyer, usdcAmount, tokensToUser);
    }

    function _handleRefund(address sender, uint256 tokenAmount) private nonReentrant {
        if (tokenAmount == 0) revert dmfUSDAmount();
        
        // Minimum refund: same as MINIMUM_PURCHASE_USDC (0.1 dmfUSD = 100,000 units) = $0.1
        // Same economic threshold as minimum purchase
        if (tokenAmount < MINIMUM_PURCHASE_USDC) revert InsufficientBalance();

        // Accumulate dividends from user's current balance before processing refund
        // This ensures accumulatedDividends[user] persists even if user refunds all tokens
        // Note: _transfer() already calls _updateUserDividendTracking(sender) before this,
        // but we explicitly accumulate here to guarantee dividends are preserved
        if (!isContract(sender)) {
            uint256 senderBalanceBefore = balanceOf(sender);
            if (senderBalanceBefore > 0) {
                uint256 currentDividendPerShare = magnifiedDividendPerShare;
                uint256 lastSenderDividendPerShare = lastDividendPerShare[sender];
                
                // Calculate and accumulate dividends from current balance before refund
                if (currentDividendPerShare > lastSenderDividendPerShare) {
                    uint256 dividendDifference = currentDividendPerShare - lastSenderDividendPerShare;
                    uint256 newDividends = (senderBalanceBefore * dividendDifference) / MAGNITUDE;
                    
                    if (newDividends > 0) {
                        accumulatedDividends[sender] += newDividends;
                    }
                }
                // Update tracking pointer - dividends are now in accumulatedDividends mapping
                lastDividendPerShare[sender] = currentDividendPerShare;
            }
        }

        uint256 _totalBurned = totalBurned;

        uint256 devFeeTokens = Math.mulDiv(tokenAmount, REFUND_DEV_FEE_BPS, 10000); 
        uint256 reflectionFeeTokens = Math.mulDiv(tokenAmount, REFUND_REFLECTION_FEE_BPS, 10000); 
        uint256 burnFeeTokens = (_totalBurned < BURNING_LIMIT) ? Math.mulDiv(tokenAmount, 75, 100000) : 0; 
        uint256 reserveFeeTokens = (_totalBurned < BURNING_LIMIT) ? Math.mulDiv(tokenAmount, 75, 100000) : Math.mulDiv(tokenAmount, 150, 100000); 
        uint256 tokensForRefund;
        unchecked {
            tokensForRefund = tokenAmount - devFeeTokens - reflectionFeeTokens - burnFeeTokens - reserveFeeTokens;
        }

        uint256 contractBalance = balanceOf(address(this));
        uint256 currentCirculatingSupply = (TOTAL_SUPPLY - _totalBurned) - contractBalance + tokenAmount;
        
        if (currentCirculatingSupply == 0) revert NoTokensInCirculation();

        // Calculate USDC value at 99.9% backing
        // Both tokensForRefund and usdcReserves are in 6 decimals
        uint256 effectiveBacking = (usdcReserves * EFFECTIVE_BACKING_NUMERATOR) / EFFECTIVE_BACKING_DENOMINATOR;
        
        // Use Math.mulDiv to prevent precision loss on division
        uint256 usdcToUser = Math.mulDiv(tokensForRefund, effectiveBacking, currentCirculatingSupply);

        if (usdcReserves < usdcToUser) revert InsufficientUSDC();

        if (devFeeTokens != 0) {
            super._transfer(address(this), devAddress, devFeeTokens);
        }
        if (burnFeeTokens != 0 && _totalBurned < BURNING_LIMIT) {
            uint256 remainingToBurn = BURNING_LIMIT - _totalBurned;
            if (burnFeeTokens > remainingToBurn) {
                burnFeeTokens = remainingToBurn;
            }
            if (burnFeeTokens != 0) {
                _burn(address(this), burnFeeTokens);
                totalBurned = totalBurned + burnFeeTokens;
            }
        }
        
        _distributeDividends(reflectionFeeTokens);

        emit Refund(sender, tokenAmount, usdcToUser);

        // Update reserves and send native USDC (convert from 6 to 18 decimals)
        usdcReserves -= usdcToUser;
        uint256 nativeUsdcAmount = usdcToUser * 1e12; // Multiply by 1e12 to convert 6->18 decimals
        (bool success, ) = payable(sender).call{value: nativeUsdcAmount}("");
        if (!success) revert USDCTransferFailed();
    }

    function _distributeDividends(uint256 amount) private {
        if (amount == 0) return;
        
        uint256 circulatingSupply = getCirculatingSupply();
        if (circulatingSupply == 0) return;

        uint256 dividendPerShare = (amount * MAGNITUDE) / circulatingSupply;
        
        magnifiedDividendPerShare += dividendPerShare;
        totalDividendsDistributed += amount;
        
        emit DividendsDistributed(amount, magnifiedDividendPerShare);
    }

    function getCirculatingSupply() private view returns (uint256) {
        uint256 total = totalSupply();
        uint256 contractBalance = balanceOf(address(this));
                
        return total - contractBalance;
    }
    
    function _updateUserDividendTracking(address user) private {
        // Exclude contracts from dividend tracking
        if (isContract(user)) return;
        
        uint256 userBalance = balanceOf(user);
        uint256 currentDividendPerShare = magnifiedDividendPerShare;
        uint256 lastUserDividendPerShare = lastDividendPerShare[user];
        
        // Calculate and accumulate dividends if user has balance
        if (userBalance > 0 && currentDividendPerShare > lastUserDividendPerShare) {
            uint256 dividendDifference = currentDividendPerShare - lastUserDividendPerShare;
            uint256 newDividends = (userBalance * dividendDifference) / MAGNITUDE;
            
            if (newDividends > 0) {
                accumulatedDividends[user] += newDividends;
            }
        }
        
        // ALWAYS update lastDividendPerShare to keep tracking synchronized
        // This prevents stale data when user's balance goes to 0 and back
        lastDividendPerShare[user] = currentDividendPerShare;
    }

    /**
     * @notice Claim accumulated dividends
     * @dev Only EOA users can claim dividends (contracts auto-excluded)
     */
    function claimDividends() external nonReentrant {
        address user = msg.sender;
        
        // Exclude contracts from dividend claiming
        if (isContract(user)) return;
        
        uint256 userBalance = balanceOf(user);
        uint256 currentDividendPerShare = magnifiedDividendPerShare;
        uint256 lastUserDividendPerShare = lastDividendPerShare[user];
        
        // Calculate and accumulate dividends if user has balance
        if (userBalance > 0 && currentDividendPerShare > lastUserDividendPerShare) {
            uint256 dividendDifference = currentDividendPerShare - lastUserDividendPerShare;
            uint256 newDividends = (userBalance * dividendDifference) / MAGNITUDE;
            
            if (newDividends > 0) {
                accumulatedDividends[user] += newDividends;
            }
        }
        
        // ALWAYS update lastDividendPerShare to keep tracking synchronized
        lastDividendPerShare[user] = currentDividendPerShare;
        
        // Transfer accumulated dividends to user
        uint256 totalAccumulated = accumulatedDividends[user];
        if (totalAccumulated > 0) {
            accumulatedDividends[user] = 0;
            super._transfer(address(this), user, totalAccumulated);
            emit DividendWithdrawn(user, totalAccumulated);
        }
    }

    /**
     * @notice View pending dividends for a user
     * @param user Address to check
     * @return Pending dividend amount in dmfUSD tokens (6 decimals)
     */
    function pendingDividends(address user) external view returns (uint256) {
        if (isContract(user)) return 0;
        
        uint256 userBalance = balanceOf(user);
        if (userBalance == 0) return accumulatedDividends[user];
        
        uint256 currentDividendPerShare = magnifiedDividendPerShare;
        uint256 lastUserDividendPerShare = lastDividendPerShare[user];        
        
        if (currentDividendPerShare > lastUserDividendPerShare) {
            uint256 dividendDifference = currentDividendPerShare - lastUserDividendPerShare;
            uint256 newDividends = (userBalance * dividendDifference) / MAGNITUDE;
            return accumulatedDividends[user] + newDividends;
        }
        
        return accumulatedDividends[user];
    }

    /**
     * @notice Calculate how many dmfUSD tokens can be purchased with a given USDC amount
     * @param usdcAmount Amount of USDC (6 decimals)
     * @return Amount of dmfUSD tokens (6 decimals)
     */
    function calculateTokensForUsdc(uint256 usdcAmount) public view returns (uint256) {
        return _getTokensForUsdc(usdcAmount, usdcReserves);
    }

    /**
     * @notice Calculate USDC amount for a given dmfUSD token refund amount
     * @param tokenAmount Amount of dmfUSD tokens to refund (6 decimals)
     * @return USDC amount that would be received (6 decimals)
     */
    function calculateUsdcForTokens(uint256 tokenAmount) public view returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        // Match the minimum refund check in _handleRefund
        if (tokenAmount < MINIMUM_PURCHASE_USDC) return 0; // Same as minimum purchase: 0.1 dmfUSD ($0.1)

        uint256 _totalBurned = totalBurned;

        // Calculate fees (same as _handleRefund)
        uint256 devFeeTokens = Math.mulDiv(tokenAmount, REFUND_DEV_FEE_BPS, 10000);
        uint256 reflectionFeeTokens = Math.mulDiv(tokenAmount, REFUND_REFLECTION_FEE_BPS, 10000);
        uint256 burnFeeTokens = (_totalBurned < BURNING_LIMIT) ? Math.mulDiv(tokenAmount, 75, 100000) : 0;
        uint256 reserveFeeTokens = (_totalBurned < BURNING_LIMIT) ? Math.mulDiv(tokenAmount, 75, 100000) : Math.mulDiv(tokenAmount, 150, 100000);
        
        uint256 tokensForRefund;
        unchecked {
            tokensForRefund = tokenAmount - devFeeTokens - reflectionFeeTokens - burnFeeTokens - reserveFeeTokens;
        }

        uint256 contractBalance = balanceOf(address(this));
        uint256 currentCirculatingSupply = (TOTAL_SUPPLY - _totalBurned) - contractBalance + tokenAmount;
        
        if (currentCirculatingSupply == 0) return 0;

        uint256 effectiveBacking = (usdcReserves * EFFECTIVE_BACKING_NUMERATOR) / EFFECTIVE_BACKING_DENOMINATOR;
        
        // Use Math.mulDiv to prevent precision loss on division
        uint256 usdcToUser = Math.mulDiv(tokensForRefund, effectiveBacking, currentCirculatingSupply);

        return usdcToUser;
    }

    function _getTokensForUsdc(uint256 usdcAmount, uint256 balanceBefore) private view returns (uint256) {
        if (usdcAmount == 0) return 0;
        uint256 availableToSell = balanceOf(address(this));
        if (availableToSell == 0) return 0;

        uint256 circulating = totalSupply() - availableToSell;

        uint256 pricePerToken;
        if (circulating == 0 || balanceBefore == 0) {
            pricePerToken = BASE_PRICE; // 1 USDC per token (1e6 in 6 decimals) = 1:1 ratio
        } else {
            // Both balanceBefore and circulating are in 6 decimals
            // refundPrice = USDC per token (in 6 decimal precision)
            uint256 refundPrice = (balanceBefore * 1e6) / circulating;
            // Add 0.1% markup for buy price
            pricePerToken = (refundPrice * 10010) / PRECISION_DIVISOR;
        }

        // Calculate tokens to purchase
        // usdcAmount is in 6 decimals, pricePerToken is in 6 decimals
        uint256 tokensToPurchase = (usdcAmount * 1e6) / pricePerToken;
        return Math.min(tokensToPurchase, availableToSell);
    }

    /**
     * @notice Check if address is a DeFi infrastructure contract
     * @dev Returns true for DEX pairs, routers, aggregators, etc.
     * @dev Smart contract wallets will return false (allowed to receive dividends)
     */
    function isContract(address _addr) internal view returns (bool) {
        if (_addr.code.length == 0) return false;
        
        (bool s0, bytes memory d0) = _addr.staticcall(abi.encodeWithSignature("token0()"));
        (bool s1, bytes memory d1) = _addr.staticcall(abi.encodeWithSignature("token1()"));
        if (s0 && s1 && d0.length == 32 && d1.length == 32) {
            return true; // DEX pair contract
        }
        
        (bool s2, ) = _addr.staticcall(abi.encodeWithSignature("factory()"));
        if (s2) return true; // Router contract
        
        (bool s3, ) = _addr.staticcall(abi.encodeWithSignature("getReserves()"));
        if (s3) return true; // Pair contract with reserves
        
        (bool s4, ) = _addr.staticcall(abi.encodeWithSignature("getPair(address,address)", address(0), address(0)));
        if (s4) return true; // DEX factory contract
        
        (bool s5, ) = _addr.staticcall(abi.encodeWithSignature("swap(address,uint256,uint256,uint256,bytes)", address(0), 0, 0, 0, ""));
        if (s5) return true; // Aggregator/swapper contract
        
        (bool s6, ) = _addr.staticcall(abi.encodeWithSignature("supply(address,uint256,address,uint16,uint256)", address(0), 0, address(0), 0, 0));
        if (s6) return true; // Lending protocol contract
        
        (bool s7, ) = _addr.staticcall(abi.encodeWithSignature("deposit(uint256)", 0));
        if (s7) return true; // Yield farm/staking contract
        
        (bool s8, ) = _addr.staticcall(abi.encodeWithSignature("sendToChain(address,uint256,uint256)", address(0), 0, 0));
        if (s8) return true; // Bridge/cross-chain contract
        
        return false;
    }

    // ============ ADMIN FUNCTIONS ============

    function setDevAddress(address _devAddress) external onlyOwner {
        if (_devAddress == address(0)) revert dmfUSDAddress();
        address oldDevAddress = devAddress;
        _isExcludedFromFee[devAddress] = false;
        devAddress = _devAddress;
        _isExcludedFromFee[devAddress] = true;
        emit DevAddressChanged(oldDevAddress, _devAddress);
    }

    function excludeFromFee(address account, bool isExcluded) external onlyOwner {
        if (account == address(0)) revert dmfUSDAddress();
        _isExcludedFromFee[account] = isExcluded;
        emit FeeExclusionSet(account, isExcluded);
    }

    // ============ VIEW FUNCTIONS ============

    function getTotalDividendsDistributed() external view returns (uint256) {
        return totalDividendsDistributed;
    }

    function getMagnifiedDividendPerShare() external view returns (uint256) {
        return magnifiedDividendPerShare;
    }
    
    function getCirculatingSupplyPublic() external view returns (uint256) {
        return getCirculatingSupply();
    }

    function getUserDividendInfo(address user) external view returns (
        uint256 balance,
        uint256 userLastDividendPerShare,
        uint256 userAccumulatedDividends,
        uint256 currentDividendPerShare,
        bool isUserContract
    ) {
        return (
            balanceOf(user),
            lastDividendPerShare[user],
            accumulatedDividends[user],
            magnifiedDividendPerShare,
            isContract(user)
        );
    }

    /**
     * @notice Get current USDC reserves backing the token
     * @return USDC reserves in 6 decimals
     */
    function getUsdcReserves() external view returns (uint256) {
        return usdcReserves;
    }

    /**
     * @notice Calculate current backing ratio (USDC per token)
     * @return Backing value per token in USDC (6 decimals)
     */
    function getBackingPerToken() external view returns (uint256) {
        uint256 circulatingSupply = getCirculatingSupply();
        if (circulatingSupply == 0) return 0;
        return (usdcReserves * 1e6) / circulatingSupply;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual override returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance < subtractedValue) revert InsufficientBalance(); 
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }
        return true;
    }
}
