"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, parseUnits, type Address } from "viem";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wallet, Coins, Loader2, ChevronDown, ShoppingCart, RotateCcw, BarChart4, LogOut } from "lucide-react";
import Image from "next/image";
import { WalletConnectDialog } from "@/components/WalletConnectDialog";
import { dmfUSD_CONTRACT, dmfEUR_CONTRACT, USDC_CONTRACT, EURC_CONTRACT } from "@/lib/web3/contracts";
import { dmfUSD_ABI, ERC20_ABI } from "@/lib/web3/contracts";
import { arcTestnet } from "@/lib/web3/config";

function Web3AppPageContent() {
  // Track if component is mounted (client-side only)
  const [mounted, setMounted] = useState(false);
  const pendingBuyAmountRef = useRef<string | null>(null);
  const searchParams = useSearchParams();

  const { address, isConnected } = useAccount();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get queryClient only after component is mounted to ensure provider is available
  const queryClient = useQueryClient();

  // Auto-open wallet dialog if query parameter is present
  useEffect(() => {
    if (mounted && searchParams.get('openWallet') === 'true' && !isConnected) {
      setIsWalletDialogOpen(true);
    }
  }, [mounted, searchParams, isConnected]);
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  // Handle logout - disconnect wallet
  const handleLogout = () => {
    disconnect();
  };

  // ERC-20 USDC balance - use USDC contract address
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: isConnected ? 30000 : false, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000,
    },
  });

  const { data: gusdtBalance, refetch: refetchGusdtBalance } = useReadContract({
    address: dmfUSD_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: isConnected ? 30000 : false, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000,
    },
  });

  // Get backing per token for all three contracts (contract state, no address needed)
  const { data: backingPerTokenGusdt } = useReadContract({
    address: dmfUSD_CONTRACT,
    abi: dmfUSD_ABI,
    functionName: "getBackingPerToken",
    query: { 
      staleTime: 60 * 1000, // Cache for 1 minute - this is contract state
      refetchInterval: false,
    },
  });

  const { data: backingPerTokenGxaut } = useReadContract({
    address: dmfEUR_CONTRACT,
    abi: dmfUSD_ABI,
    functionName: "getBackingPerToken",
    query: { 
      staleTime: 60 * 1000, // Cache for 1 minute
      refetchInterval: false,
    },
  });

  // Dividends for all DMF tokens (only fetch when connected)
  const { data: pendingDividends, refetch: refetchPendingDividends } = useReadContract({
    address: dmfUSD_CONTRACT,
    abi: dmfUSD_ABI,
    functionName: "pendingDividends",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: 30000, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000, // Consider data fresh for 20 seconds
    },
  });

  const { data: pendingDividendsGxaut, refetch: refetchPendingDividendsGxaut } = useReadContract({
    address: dmfEUR_CONTRACT,
    abi: dmfUSD_ABI,
    functionName: "pendingDividends",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: 30000, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000,
    },
  });

  // USDC decimals - contract constant (ERC-20 USDC uses 6 decimals)
  const { data: usdcDecimals } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { 
      staleTime: Infinity, // Decimals never change
      refetchInterval: false,
    },
  });

  // EURC balance - use EURC contract address
  const { data: xautBalance, refetch: refetchXautBalance } = useReadContract({
    address: EURC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: isConnected ? 30000 : false, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000,
    },
  });

  // dmfEUR balance
  const { data: gxautBalance, refetch: refetchGxautBalance } = useReadContract({
    address: dmfEUR_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected, 
      refetchInterval: isConnected ? 30000 : false, // Auto-update every 30 seconds when connected
      staleTime: 20 * 1000,
    },
  });

  // EURC decimals - contract constant (same as USDC, both use 6 decimals)
  const { data: eurcDecimals } = useReadContract({
    address: EURC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { 
      staleTime: Infinity, // Decimals never change
      refetchInterval: false,
    },
  });

  // Tab state for Buy and Refund
  const [activeBuyTab, setActiveBuyTab] = useState<'dmfUSD' | 'dmfEUR'>('dmfUSD');
  const [activeRefundTab, setActiveRefundTab] = useState<'dmfUSD' | 'dmfEUR'>('dmfUSD');
  
  // Mobile view state
  const [selectedCurrency, setSelectedCurrency] = useState<'USDC' | 'EURC'>('USDC');
  const [activeAction, setActiveAction] = useState<'dTokens' | 'Buy' | 'Interest' | 'Refund' | 'Faucet'>('dTokens');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [selectedBuyToken, setSelectedBuyToken] = useState<'dmfUSD' | 'dmfEUR'>('dmfUSD');
  const [selectedRefundToken, setSelectedRefundToken] = useState<'dmfUSD' | 'dmfEUR'>('dmfUSD');
  const [isBuyDropdownOpen, setIsBuyDropdownOpen] = useState(false);
  const [isRefundDropdownOpen, setIsRefundDropdownOpen] = useState(false);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buyDropdownRef = useRef<HTMLDivElement>(null);
  const refundDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCurrencyDropdownOpen(false);
      }
      if (buyDropdownRef.current && !buyDropdownRef.current.contains(event.target as Node)) {
        setIsBuyDropdownOpen(false);
      }
      if (refundDropdownRef.current && !refundDropdownRef.current.contains(event.target as Node)) {
        setIsRefundDropdownOpen(false);
      }
    };

    if (isCurrencyDropdownOpen || isBuyDropdownOpen || isRefundDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCurrencyDropdownOpen, isBuyDropdownOpen, isRefundDropdownOpen]);

  // Track previous action to detect when switching to Buy
  const prevActionRef = useRef(activeAction);
  const currencyChangeSourceRef = useRef<'balance' | 'buy' | null>(null);
  
  // Sync Buy dropdown with Available Balance dropdown when Available Balance changes (only on Buy action)
  // This allows Available Balance to control Buy dropdown, but Buy dropdown can also change Available Balance
  useEffect(() => {
    // Only sync when we're on the Buy action
    if (activeAction !== 'Buy') return;
    
    // Only sync when the currency change came from Available Balance dropdown, not from Buy dropdown
    if (currencyChangeSourceRef.current === 'balance') {
      // When Available Balance currency changes, update Buy dropdown
      if (selectedCurrency === 'USDC') {
        setSelectedBuyToken('dmfUSD');
        setActiveBuyTab('dmfUSD');
      } else if (selectedCurrency === 'EURC') {
        setSelectedBuyToken('dmfEUR');
        setActiveBuyTab('dmfEUR');
      }
      // Reset the source after syncing
      currencyChangeSourceRef.current = null;
    }
  }, [activeAction, selectedCurrency]);

  // Sync Buy dropdown with Refund dropdown when switching to Buy action
  useEffect(() => {
    // Only sync when switching TO Buy action (not continuously)
    if (activeAction === 'Buy' && prevActionRef.current !== 'Buy') {
      // When switching to Buy, sync with Refund selection
      setSelectedBuyToken(selectedRefundToken);
      setActiveBuyTab(selectedRefundToken);
      // Also sync the Available Balance currency
      if (selectedRefundToken === 'dmfUSD') {
        setSelectedCurrency('USDC');
      } else if (selectedRefundToken === 'dmfEUR') {
        setSelectedCurrency('EURC');
      }
    }
    prevActionRef.current = activeAction;
  }, [activeAction, selectedRefundToken]);

  // Buy state
  const [buyAmount, setBuyAmount] = useState("");
  const [estimatedTokens, setEstimatedTokens] = useState<string | null>(null);

  // Refund state
  const [refundAmount, setRefundAmount] = useState("");
  const [estimatedUsdt, setEstimatedUsdt] = useState<string | null>(null);

  // Contract interactions
  const { writeContract: writeContractBuy, data: buyHash, isPending: isBuying } = useWriteContract();
  const { writeContract: writeContractApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeContractClaim, data: claimHash, isPending: isClaiming } = useWriteContract();
  const { writeContract: writeContractRefund, data: refundHash, isPending: isRefunding } = useWriteContract();

  // USDC allowance check (for dmfUSD purchases)
  const { data: usdcAllowance } = useReadContract({
    address: USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && dmfUSD_CONTRACT ? [address, dmfUSD_CONTRACT] : undefined,
    query: { 
      enabled: !!address && !!dmfUSD_CONTRACT && isConnected && activeAction === 'Buy', 
      refetchInterval: isConnected && activeAction === 'Buy' ? 30000 : false,
      staleTime: 20 * 1000,
    },
  });
  
  // EURC allowance check (for dmfEUR purchases)
  const { data: eurcAllowance } = useReadContract({
    address: EURC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && dmfEUR_CONTRACT ? [address, dmfEUR_CONTRACT] : undefined,
    query: { 
      enabled: !!address && !!dmfEUR_CONTRACT && isConnected && activeAction === 'Buy', 
      refetchInterval: isConnected && activeAction === 'Buy' ? 30000 : false,
      staleTime: 20 * 1000,
    },
  });

  // Refetch all balances and values after transaction success
  const refetchAllBalances = async () => {
    // Invalidate all queries to force fresh data
    queryClient.invalidateQueries({ queryKey: ['readContract'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['balance', { address, chainId: arcTestnet.id }] });
    
    // Refetch all balances and dividends
    await Promise.all([
      refetchPendingDividends(),
      refetchPendingDividendsGxaut(),
      refetchUsdcBalance(),
      refetchGusdtBalance(),
      refetchXautBalance(),
      refetchGxautBalance(),
    ]);
  };

  // Manual refresh function for dividends
  const handleRefreshDividends = async () => {
    queryClient.invalidateQueries({ queryKey: ['readContract'], exact: false });
    await refetchPendingDividends();
    await refetchPendingDividendsGxaut();
  };

  // Transaction receipts
  const { isLoading: isConfirmingBuy, isSuccess: isBuySuccess, isError: isBuyError, data: buyReceipt } = useWaitForTransactionReceipt({ hash: buyHash });
  const { isLoading: isConfirmingApprove, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isConfirmingClaim, isSuccess: isClaimSuccess, isError: isClaimError, data: claimReceipt } = useWaitForTransactionReceipt({ hash: claimHash });
  const { isLoading: isConfirmingRefund, isSuccess: isRefundSuccess, isError: isRefundError, data: refundReceipt } = useWaitForTransactionReceipt({ hash: refundHash });

  // Auto-buy after approval is confirmed
  useEffect(() => {
    if (isApproveSuccess && approveHash && pendingBuyAmountRef.current && !isConfirmingBuy && !isBuying) {
      const buyAmount = pendingBuyAmountRef.current;
      pendingBuyAmountRef.current = null;
      
      // Determine contract address based on active tab or selected buy token
      const token = selectedBuyToken || activeBuyTab;
      let contractAddress: Address;
      let backingTokenDecimals: number = 6;

      if (token === 'dmfUSD') {
        contractAddress = dmfUSD_CONTRACT;
        backingTokenDecimals = typeof usdcDecimals === 'number' ? usdcDecimals : 6;
      } else {
        contractAddress = dmfEUR_CONTRACT;
        backingTokenDecimals = typeof eurcDecimals === 'number' ? eurcDecimals : 6;
      }
      
      // Auto-trigger buy transaction after approval (both use ERC-20 tokens now)
      const tokenAmount = parseUnits(buyAmount, backingTokenDecimals);
      writeContractBuy({
        address: contractAddress,
        abi: dmfUSD_ABI,
        functionName: "buy",
        args: [tokenAmount],
      });
    }
  }, [isApproveSuccess, approveHash, isConfirmingBuy, isBuying, writeContractBuy, activeBuyTab, selectedBuyToken, usdcDecimals, eurcDecimals]);

  // Refetch balances 2 seconds after transaction success confirmation
  useEffect(() => {
    if (isBuySuccess || isClaimSuccess || isRefundSuccess) {
      // Clear amount fields immediately after successful transaction
      if (isBuySuccess) {
        setBuyAmount("");
        setEstimatedTokens(null);
      }
      if (isRefundSuccess) {
        setRefundAmount("");
        setEstimatedUsdt(null);
      }
      
      // Wait 2 seconds after transaction confirmation for blockchain state to update
      const timeoutId = setTimeout(() => {
        refetchAllBalances();
      }, 2000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isBuySuccess, isClaimSuccess, isRefundSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get contract address based on active buy tab or selected buy token
  const getBuyContractAddress = () => {
    const token = selectedBuyToken || activeBuyTab;
    if (token === 'dmfUSD') return dmfUSD_CONTRACT;
    return dmfEUR_CONTRACT;
  };

  // Get the correct function name for buy calculation based on active tab
  const getBuyCalculationFunction = () => {
    const token = selectedBuyToken || activeBuyTab;
    if (token === 'dmfUSD') return 'calculateTokensForUsdc';
    return 'calculateTokensForEurc'; // dmfEUR contract uses calculateTokensForEurc
  };

  // Get accurate token estimate from contract (dynamic based on active tab)
  const currentBuyToken = selectedBuyToken || activeBuyTab;
  const minPurchase = 0.1; // Minimum purchase for both tokens is 0.1
  const { data: estimatedTokensData, isLoading: isLoadingEstimate, error: estimateError, refetch: refetchBuyEstimate } = useReadContract({
    address: getBuyContractAddress(),
    abi: dmfUSD_ABI,
    functionName: getBuyCalculationFunction() as any,
    args: buyAmount && parseFloat(buyAmount) > 0 ? [parseUnits(buyAmount, 6)] : undefined,
    query: { 
      enabled: !!buyAmount && !!address && isConnected && parseFloat(buyAmount) > 0 && parseFloat(buyAmount) >= minPurchase,
      retry: 0, // Don't retry on revert - it's likely a contract state issue
      staleTime: 5 * 1000, // Cache for 5 seconds - estimates change with contract state
    },
  });

  // Force refetch when tab or selected token changes and buyAmount exists
  useEffect(() => {
    if (buyAmount && parseFloat(buyAmount) > 0 && parseFloat(buyAmount) >= minPurchase) {
      // Small delay to ensure contract address is updated
      const timer = setTimeout(() => {
        refetchBuyEstimate();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeBuyTab, selectedBuyToken, buyAmount, minPurchase, refetchBuyEstimate]);

  // Debug: Log estimate query status for troubleshooting
  useEffect(() => {
    if (buyAmount && parseFloat(buyAmount) > 0) {
      console.log(`${activeBuyTab} Buy Estimate Debug:`, {
        contractAddress: getBuyContractAddress(),
        functionName: getBuyCalculationFunction(),
        buyAmount,
        minPurchase,
        enabled: !!buyAmount && !!address && parseFloat(buyAmount) > 0 && parseFloat(buyAmount) >= minPurchase,
        isLoading: isLoadingEstimate,
        error: estimateError ? {
          message: estimateError instanceof Error ? estimateError.message : String(estimateError),
          name: estimateError instanceof Error ? estimateError.name : typeof estimateError,
          stack: estimateError instanceof Error ? estimateError.stack : undefined,
        } : null,
        data: estimatedTokensData,
        address,
      });
    }
  }, [activeBuyTab, buyAmount, isLoadingEstimate, estimateError, estimatedTokensData, address, minPurchase]);

  // Reset estimate when tab or selected token changes to ensure fresh calculation
  useEffect(() => {
    setEstimatedTokens(null);
    // Force query refetch when tab changes by invalidating contract queries
    queryClient.invalidateQueries({ queryKey: ['readContract'] });
  }, [activeBuyTab, selectedBuyToken, queryClient]);

  // Format estimated tokens for display
  useEffect(() => {
    // Reset when tab changes first
    if (!estimatedTokensData) {
      setEstimatedTokens(null);
      return;
    }

    if (typeof estimatedTokensData === 'bigint') {
      const formatted = formatUnits(estimatedTokensData, 6);
      const parsed = parseFloat(formatted);
      if (parsed > 0 && !isNaN(parsed)) {
        setEstimatedTokens(parsed.toFixed(6));
      } else {
        setEstimatedTokens(null);
      }
    } else {
      setEstimatedTokens(null);
    }
  }, [estimatedTokensData, activeBuyTab]);

  // Get backing per token for refund calculation (dynamic based on active refund tab or selected refund token)
  const getBackingPerTokenForRefund = () => {
    const token = selectedRefundToken || activeRefundTab;
    if (token === 'dmfUSD') return backingPerTokenGusdt;
    return backingPerTokenGxaut;
  };

  // Reset refund estimate when tab or selected token changes to ensure fresh calculation
  useEffect(() => {
    setEstimatedUsdt(null);
  }, [activeRefundTab, selectedRefundToken]);

  // Calculate refund estimate using backing per token
  // Formula: refundAmount * backingPerToken / 1e6
  useEffect(() => {
    if (!refundAmount || parseFloat(refundAmount) <= 0) {
      setEstimatedUsdt(null);
      return;
    }

    const backingPerToken = getBackingPerTokenForRefund();
    if (!backingPerToken || typeof backingPerToken !== 'bigint') {
      setEstimatedUsdt(null);
      return;
    }

    const refundAmountBigInt = parseUnits(refundAmount, 6); // Convert to 6 decimals
    // Calculate: (refundAmount * backingPerToken) / 1e6
    const estimatedRefundBigInt = (refundAmountBigInt * backingPerToken) / BigInt(1e6);
    const formatted = formatUnits(estimatedRefundBigInt, 6);
    const estimatedValue = parseFloat(formatted);

    if (estimatedValue > 0) {
      const token = selectedRefundToken || activeRefundTab;
      const backingToken = token === 'dmfUSD' ? 'USDC' : 'EURC';
      // Show more precision for XAUT, 2 decimals for USDT
      const decimals = backingToken === 'USDC' ? 2 : 6;
      setEstimatedUsdt(`${getCurrencySymbol(backingToken as 'USDC' | 'EURC')}${estimatedValue.toFixed(decimals)} ${backingToken}`);
    } else {
      setEstimatedUsdt(null);
    }
  }, [refundAmount, activeRefundTab, selectedRefundToken, backingPerTokenGusdt, backingPerTokenGxaut]);

  const handleBuy = async () => {
    if (!address || !buyAmount) return;

    const amount = parseFloat(buyAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Determine contract addresses based on active tab or selected buy token
    const token = selectedBuyToken || activeBuyTab;
    let contractAddress: Address;
    let backingTokenAddress: Address;
    let backingTokenDecimals: number = 6;

    if (token === 'dmfUSD') {
      contractAddress = dmfUSD_CONTRACT;
      backingTokenAddress = USDC_CONTRACT; // ERC-20 USDC contract address
      backingTokenDecimals = typeof usdcDecimals === 'number' ? usdcDecimals : 6;
    } else {
      contractAddress = dmfEUR_CONTRACT;
      backingTokenAddress = EURC_CONTRACT; // Use EURC contract address
      backingTokenDecimals = typeof eurcDecimals === 'number' ? eurcDecimals : 6;
    }

    const tokenAmount = parseUnits(buyAmount, backingTokenDecimals);

    try {
      // For both dmfUSD and dmfEUR, check allowance first
      if (token === 'dmfUSD') {
        const allowanceValue = (typeof usdcAllowance === 'bigint' ? usdcAllowance : 0n);
        if (allowanceValue >= tokenAmount) {
          // Buy directly if already approved
          await writeContractBuy({
            address: contractAddress,
            abi: dmfUSD_ABI,
            functionName: "buy",
            args: [tokenAmount],
          });
          return;
        }
        
        // Store the buy amount and contract to auto-buy after approval
        pendingBuyAmountRef.current = buyAmount;
        
        // Approve USDC first - buy will be triggered automatically after approval succeeds
        await writeContractApprove({
          address: backingTokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [contractAddress, tokenAmount],
        });
        return;
      } else if (token === 'dmfEUR') {
        const allowanceValue = (typeof eurcAllowance === 'bigint' ? eurcAllowance : 0n);
        if (allowanceValue >= tokenAmount) {
          // Buy directly if already approved
          await writeContractBuy({
            address: contractAddress,
            abi: dmfUSD_ABI,
            functionName: "buy",
            args: [tokenAmount],
          });
          return;
        }
        
        // Store the buy amount and contract to auto-buy after approval
        pendingBuyAmountRef.current = buyAmount;
        
        // Approve EURC first - buy will be triggered automatically after approval succeeds
        await writeContractApprove({
          address: backingTokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [contractAddress, tokenAmount],
        });
        return;
      }
    } catch (error: any) {
      console.error("Buy error:", error);
      pendingBuyAmountRef.current = null; // Reset on error
      // Immediately reset amount field and button state
      setBuyAmount("");
      setEstimatedTokens(null);
      // Check if it's a user rejection (MetaMask cancellation)
      const isUserRejection = error?.code === 4001 || 
                             error?.code === 'ACTION_REJECTED' || 
                             error?.message?.includes('rejected') ||
                             error?.message?.includes('User rejected');
      // For both cancellation and errors, show failed status for 2 seconds
      // Keep activeTransactionType so failed button can display
      setTxStatus(prev => ({ ...prev, buy: 'failed' }));
      // Clear activeTransactionType after 2 seconds
      setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, buy: null }));
      }, 2000);
    }
  };

  const handleClaim = async (tokenType: 'dmfUSD' | 'dmfEUR' = 'dmfUSD') => {
    if (!address) return;

    setActiveTransactionType('claim');
    setActiveClaimToken(tokenType);

    let contractAddress: Address;
    if (tokenType === 'dmfUSD') {
      contractAddress = dmfUSD_CONTRACT;
    } else {
      contractAddress = dmfEUR_CONTRACT;
    }

    try {
      await writeContractClaim({
        address: contractAddress,
        abi: dmfUSD_ABI,
        functionName: "claimDividends",
        args: [],
      });
    } catch (error: any) {
      console.error("Claim error:", error);
      // For both cancellation and errors, show failed status for 2 seconds
      // Keep activeTransactionType so failed button can display
      setTxStatus(prev => ({ ...prev, claim: 'failed' }));
      // Clear activeTransactionType after 2 seconds
      setTimeout(() => {
      setActiveTransactionType(null);
      setActiveClaimToken(null);
        setTxStatus(prev => ({ ...prev, claim: null }));
      }, 2000);
    }
  };

  const handleRefund = async () => {
    if (!address || !refundAmount) return;

    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Determine contract address based on active refund tab or selected refund token
    const token = selectedRefundToken || activeRefundTab;
    let contractAddress: Address;
    if (token === 'dmfUSD') {
      contractAddress = dmfUSD_CONTRACT;
    } else {
      contractAddress = dmfEUR_CONTRACT;
    }

    const tokenAmount = parseUnits(refundAmount, 6); // All DMF tokens have 6 decimals

    try {
      // Refund is done by transferring tokens to the contract
      await writeContractRefund({
        address: contractAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [contractAddress, tokenAmount],
      });
    } catch (error: any) {
      console.error("Refund error:", error);
      // Immediately reset amount field and button state
      setRefundAmount("");
      setEstimatedUsdt(null);
      // For both cancellation and errors, show failed status for 2 seconds
      // Keep activeTransactionType so failed button can display
      setTxStatus(prev => ({ ...prev, refund: 'failed' }));
      // Clear activeTransactionType after 2 seconds
      setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, refund: null }));
      }, 2000);
    }
  };

  // ERC-20 USDC balance (6 decimals)
  const usdtBalanceFormatted = (usdcBalance && typeof usdcBalance === 'bigint')
    ? formatUnits(usdcBalance, typeof usdcDecimals === 'number' ? usdcDecimals : 6)
    : "0";
  const gusdtBalanceFormatted = (typeof gusdtBalance === 'bigint')
    ? formatUnits(gusdtBalance, 6)
    : "0";
  const pendingDividendsFormatted = (typeof pendingDividends === 'bigint')
    ? formatUnits(pendingDividends, 6)
    : "0";
  const pendingDividendsGxautFormatted = (typeof pendingDividendsGxaut === 'bigint')
    ? formatUnits(pendingDividendsGxaut, 6)
    : "0";
  // Calculate backing equivalent for all DMF tokens
  // getBackingPerToken returns value in 6 decimals (e.g., 1003005 = 1.003005)
  // Formula: (balance * backingPerToken) / 1e6
  const gusdtUsdtEquivalent = (typeof gusdtBalance === 'bigint' && typeof backingPerTokenGusdt === 'bigint')
    ? formatUnits((gusdtBalance * backingPerTokenGusdt) / BigInt(1e6), 6)
    : "0";

  const gxautXautEquivalent = (typeof gxautBalance === 'bigint' && typeof backingPerTokenGxaut === 'bigint')
    ? formatUnits((gxautBalance * backingPerTokenGxaut) / BigInt(1e6), 6)
    : "0";

  // Format EURC and dmfEUR balances
  const xautBalanceFormatted = (typeof xautBalance === 'bigint' && typeof eurcDecimals === 'number')
    ? formatUnits(xautBalance, eurcDecimals)
    : "0";
  const gxautBalanceFormatted = (typeof gxautBalance === 'bigint')
    ? formatUnits(gxautBalance, 6)
    : "0";

  // Check if approval is needed based on selected token
  const needsApproval = (() => {
    if (!buyAmount) return true;
    const token = selectedBuyToken || activeBuyTab;
    const decimals = typeof usdcDecimals === 'number' ? usdcDecimals : 6;
    if (token === 'dmfUSD') {
      // Check USDC allowance
      return !(typeof usdcAllowance === 'bigint' && usdcAllowance >= parseUnits(buyAmount, decimals));
    } else if (token === 'dmfEUR') {
      // Check EURC allowance
      return !(typeof eurcAllowance === 'bigint' && eurcAllowance >= parseUnits(buyAmount, decimals));
    }
    return true;
  })();

  const isAwaitingBuy = isApproveSuccess && isConfirmingBuy;

  const [activeTransactionType, setActiveTransactionType] = useState<'buy' | 'refund' | 'claim' | null>(null);
  const [activeClaimToken, setActiveClaimToken] = useState<'dmfUSD' | 'dmfEUR' | null>(null);
  
  // Transaction status tracking with delay
  const [txStatus, setTxStatus] = useState<{
    buy: 'pending' | 'success' | 'failed' | null;
    claim: 'pending' | 'success' | 'failed' | null;
    refund: 'pending' | 'success' | 'failed' | null;
  }>({
    buy: null,
    claim: null,
    refund: null,
  });

  // Track transaction status with 1-2 second delay
  // Only show success when transaction receipt confirms success on blockchain
  useEffect(() => {
    // Only set success if: receipt exists, status is success, and transaction is confirmed
    if (isBuySuccess && buyHash && buyReceipt && buyReceipt.status === 'success') {
      // Wait 1-2 seconds before showing success status
      const timeoutId = setTimeout(() => {
        setTxStatus(prev => ({ ...prev, buy: 'success' }));
        // Clear success status after 2 seconds of display
        setTimeout(() => {
          setTxStatus(prev => ({ ...prev, buy: null }));
          setActiveTransactionType(null);
        }, 2000);
      }, 1500);
      return () => clearTimeout(timeoutId);
    } else if (isBuyError && buyHash) {
      // Immediately reset amount field and button state
      setBuyAmount("");
      setEstimatedTokens(null);
      // Set failed status immediately to stop loading spinner, but keep activeTransactionType for button display
      setTxStatus(prev => ({ ...prev, buy: 'failed' }));
      // Clear activeTransactionType and status after 2 seconds
      const timeoutId = setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, buy: null }));
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isBuySuccess, isBuyError, buyHash, buyReceipt]);

  useEffect(() => {
    // Only set success if: receipt exists, status is success, and transaction is confirmed
    if (isClaimSuccess && claimHash && claimReceipt && claimReceipt.status === 'success') {
      const timeoutId = setTimeout(() => {
        setTxStatus(prev => ({ ...prev, claim: 'success' }));
        // Clear success status after 2 seconds of display
        setTimeout(() => {
          setTxStatus(prev => ({ ...prev, claim: null }));
          setActiveTransactionType(null);
          setActiveClaimToken(null);
        }, 2000);
      }, 1500);
      return () => clearTimeout(timeoutId);
    } else if (isClaimError && claimHash) {
      // Set failed status immediately to stop loading spinner, but keep activeTransactionType for button display
      setTxStatus(prev => ({ ...prev, claim: 'failed' }));
      // Clear activeTransactionType and status after 2 seconds
      const timeoutId = setTimeout(() => {
        setActiveTransactionType(null);
        setActiveClaimToken(null);
        setTxStatus(prev => ({ ...prev, claim: null }));
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isClaimSuccess, isClaimError, claimHash, claimReceipt]);

  useEffect(() => {
    // Only set success if: receipt exists, status is success, and transaction is confirmed
    if (isRefundSuccess && refundHash && refundReceipt && refundReceipt.status === 'success') {
      const timeoutId = setTimeout(() => {
        setTxStatus(prev => ({ ...prev, refund: 'success' }));
        // Clear success status after 2 seconds of display
        setTimeout(() => {
          setTxStatus(prev => ({ ...prev, refund: null }));
          setActiveTransactionType(null);
        }, 2000);
      }, 1500);
      return () => clearTimeout(timeoutId);
    } else if (isRefundError && refundHash) {
      // Immediately reset amount field and button state
      setRefundAmount("");
      setEstimatedUsdt(null);
      // Set failed status immediately to stop loading spinner, but keep activeTransactionType for button display
      setTxStatus(prev => ({ ...prev, refund: 'failed' }));
      // Clear activeTransactionType and status after 2 seconds
      const timeoutId = setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, refund: null }));
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isRefundSuccess, isRefundError, refundHash, refundReceipt]);

  // Reset transaction status when switching between actions
  useEffect(() => {
    // Clear all transaction statuses when switching actions
    setTxStatus({ buy: null, claim: null, refund: null });
    setActiveTransactionType(null);
    setActiveClaimToken(null);
  }, [activeAction]);

  // Reset transaction status when new transaction starts (hash changes)
  useEffect(() => {
    if (buyHash) {
      // Clear any old success status when starting a new buy transaction
      setTxStatus(prev => ({ ...prev, buy: 'pending' }));
    } else if (!buyHash && !isConfirmingBuy && !isBuying) {
      // Clear status when hash is cleared and no transaction is in progress
      setTxStatus(prev => ({ ...prev, buy: null }));
    }
  }, [buyHash, isConfirmingBuy, isBuying]);

  useEffect(() => {
    if (claimHash) {
      setTxStatus(prev => ({ ...prev, claim: 'pending' }));
    } else if (!claimHash && !isConfirmingClaim && !isClaiming) {
      setTxStatus(prev => ({ ...prev, claim: null }));
    }
  }, [claimHash, isConfirmingClaim, isClaiming]);

  useEffect(() => {
    if (refundHash) {
      setTxStatus(prev => ({ ...prev, refund: 'pending' }));
    } else if (!refundHash && !isConfirmingRefund && !isRefunding) {
      setTxStatus(prev => ({ ...prev, refund: null }));
    }
  }, [refundHash, isConfirmingRefund, isRefunding]);

  // Detect user cancellation: when isPending becomes false without a hash
  useEffect(() => {
    if (activeTransactionType === 'buy' && !isBuying && !isApproving && !isConfirmingBuy && !isConfirmingApprove && !buyHash && txStatus.buy !== 'failed') {
      // User cancelled - no hash was generated
      // Immediately reset amount field
      setBuyAmount("");
      setEstimatedTokens(null);
      // Show failed status for 2 seconds
      setTxStatus(prev => ({ ...prev, buy: 'failed' }));
      setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, buy: null }));
      }, 2000);
    }
  }, [isBuying, isApproving, isConfirmingBuy, isConfirmingApprove, buyHash, activeTransactionType, txStatus.buy]);

  useEffect(() => {
    if (activeTransactionType === 'claim' && !isClaiming && !isConfirmingClaim && !claimHash && txStatus.claim !== 'failed') {
      // User cancelled - no hash was generated
      // Show failed status for 2 seconds
      setTxStatus(prev => ({ ...prev, claim: 'failed' }));
      setTimeout(() => {
        setActiveTransactionType(null);
        setActiveClaimToken(null);
        setTxStatus(prev => ({ ...prev, claim: null }));
      }, 2000);
    }
  }, [isClaiming, isConfirmingClaim, claimHash, activeTransactionType, txStatus.claim]);

  useEffect(() => {
    if (activeTransactionType === 'refund' && !isRefunding && !isConfirmingRefund && !refundHash && txStatus.refund !== 'failed') {
      // User cancelled - no hash was generated
      // Immediately reset amount field
      setRefundAmount("");
      setEstimatedUsdt(null);
      // Show failed status for 2 seconds
      setTxStatus(prev => ({ ...prev, refund: 'failed' }));
      setTimeout(() => {
        setActiveTransactionType(null);
        setTxStatus(prev => ({ ...prev, refund: null }));
      }, 2000);
    }
  }, [isRefunding, isConfirmingRefund, refundHash, activeTransactionType, txStatus.refund]);

  const handleBuyWithTracking = async () => {
    setActiveTransactionType('buy');
    // Use selectedBuyToken for mobile view, fallback to activeBuyTab
    const tokenToUse = selectedBuyToken || activeBuyTab;
    if (tokenToUse === 'dmfUSD') {
      setActiveBuyTab('dmfUSD');
    } else {
      setActiveBuyTab('dmfEUR');
    }
    await handleBuy();
  };

  const handleRefundWithTracking = async () => {
    setActiveTransactionType('refund');
    // Use selectedRefundToken for mobile view, fallback to activeRefundTab
    const tokenToUse = selectedRefundToken || activeRefundTab;
    if (tokenToUse === 'dmfUSD') {
      setActiveRefundTab('dmfUSD');
    } else if (tokenToUse === 'dmfEUR') {
      setActiveRefundTab('dmfEUR');
    } else {
      setActiveRefundTab('dmfEUR');
    }
    await handleRefund();
  };

  // Helper function to get currency symbol
  const getCurrencySymbol = (token: 'dmfUSD' | 'dmfEUR' | 'USDC' | 'EURC'): string => {
    if (token === 'dmfUSD' || token === 'USDC') return '$';
    if (token === 'dmfEUR' || token === 'EURC') return '€';
    return '$'; // Default fallback
  };

  // Helper functions to get balance and info based on active tab
  const getBackingBalanceForBuyTab = () => {
    if (activeBuyTab === 'dmfUSD') return parseFloat(usdtBalanceFormatted).toFixed(2);
      return parseFloat(xautBalanceFormatted).toFixed(2);
  };

  const getBackingTokenLabelForBuyTab = () => {
    if (activeBuyTab === 'dmfUSD') return 'USDC';
    return 'EURC';
  };

  // Helper function to get minimum purchase amount for each token
  const getMinimumPurchaseAmount = () => {
    return '0.1'; // Minimum purchase for both tokens is 0.1
  };

  // Helper function to format minimum purchase display
  const getMinimumPurchaseDisplay = () => {
    const minAmount = getMinimumPurchaseAmount();
    const tokenLabel = getBackingTokenLabelForBuyTab();
    return `${minAmount} ${tokenLabel}`;
  };

  const getGTokenBalanceForRefundTab = () => {
    if (activeRefundTab === 'dmfUSD') return gusdtBalanceFormatted;
    return gxautBalanceFormatted;
  };

  const getTokenLabel = (token: 'dmfUSD' | 'dmfEUR') => {
    return token;
  };

  // Helper function to get the backing token name for refund tab
  const getBackingTokenLabelForRefundTab = () => {
    if (activeRefundTab === 'dmfUSD') return 'USDC';
    return 'EURC';
  };

  // Helper function to get minimum refund amount for each token
  const getMinimumRefundAmount = () => {
    return '0.1'; // Minimum refund for both tokens is 0.1
  };

  // Helper function to format minimum refund display
  const getMinimumRefundDisplay = () => {
    const minAmount = getMinimumRefundAmount();
    return `${minAmount} ${activeRefundTab}`;
  };

  // Helper functions for mobile currency selection
  const getCurrencyBalance = () => {
    if (selectedCurrency === 'USDC') {
      return parseFloat(usdtBalanceFormatted).toFixed(2);
    } else {
      return parseFloat(xautBalanceFormatted).toFixed(2);
    }
  };

  const getGTokenBalance = () => {
    if (selectedCurrency === 'USDC') {
      return { balance: gusdtBalanceFormatted, equivalent: gusdtUsdtEquivalent, token: 'dmfUSD' };
    } else {
      return { balance: gxautBalanceFormatted, equivalent: gxautXautEquivalent, token: 'dmfEUR' };
    }
  };

  const getPendingDividends = () => {
    if (selectedCurrency === 'USDC') {
      return pendingDividendsFormatted;
    } else {
      return pendingDividendsGxautFormatted;
    }
  };

  const getGTokenContract = () => {
    if (selectedCurrency === 'USDC') return 'dmfUSD';
    return 'dmfEUR';
  };

  return (
    <div className="font-jura min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            {mounted && isConnected ? (
              <>
                <div className="flex items-center gap-3">
                  <Link 
                    href="https://dmfam.org" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <Image src="/images/axo.png" alt="DMF Logo" width={40} height={40} />
                  </Link>
                  <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-gray-800 mb-1">Welcome</h1>
                    <p className="text-sm text-gray-500 font-mono">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  LogOut
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Link 
                    href="https://dmfam.org" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <Image src="/images/axo.png" alt="DMF Logo" width={40} height={40} />
                  </Link>
                  <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-gray-800 mb-1">Welcome</h1>
                  </div>
                </div>
                <button
                  onClick={() => setIsWalletDialogOpen(true)}
                  className="flex items-center justify-center px-4 py-2 bg-blue-300 text-blue-800 rounded-lg hover:bg-blue-400 transition-colors text-sm font-medium"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  LogIn
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Mobile Optimized */}
      <main className="px-4 py-6 max-w-md mx-auto">
        <>
          {/* Balance Section */}
            <div className="bg-white rounded-2xl shadow-lg p-5 mb-6 border border-gray-100">
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-1">Available Balance</p>
                <p className="text-2xl font-bold text-gray-900">
                  {parseFloat(usdtBalanceFormatted).toFixed(2)} USDC
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-1">EURC Balance</p>
                <p className="text-xl font-semibold text-gray-800">{getCurrencySymbol('EURC')}{parseFloat(xautBalanceFormatted).toFixed(2)} EURC</p>
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setActiveAction('dTokens')}
                className={`p-4 rounded-xl shadow-md transition-all ${
                  activeAction === 'dTokens'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-50'
                }`}
              >
                <Coins className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">DMF-Tokens</p>
              </button>
              <button
                onClick={() => setActiveAction('Buy')}
                className={`p-4 rounded-xl shadow-md transition-all ${
                  activeAction === 'Buy'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-50'
                }`}
              >
                <ShoppingCart className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">Buy</p>
              </button>
              <button
                onClick={() => setActiveAction('Interest')}
                className={`p-4 rounded-xl shadow-md transition-all ${
                  activeAction === 'Interest'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-50'
                }`}
              >
                <BarChart4 className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">Interest</p>
              </button>
              <button
                onClick={() => setActiveAction('Refund')}
                className={`p-4 rounded-xl shadow-md transition-all ${
                  activeAction === 'Refund'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-50'
                }`}
              >
                <RotateCcw className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">Refund</p>
              </button>
              <button
                onClick={() => setActiveAction(activeAction === 'Faucet' ? 'dTokens' : 'Faucet')}
                className={`p-4 rounded-xl shadow-md transition-all col-span-2 ${
                  activeAction === 'Faucet'
                    ? 'bg-green-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-50'
                }`}
              >
                <Wallet className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">ARC Testnet Faucet</p>
              </button>
            </div>

            {/* Dynamic Content Section */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
              {activeAction === 'dTokens' && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Your DMF-Tokens</h2>
                  <div className="space-y-3">
                    {(['dmfUSD', 'dmfEUR'] as const).map((token) => {
                      const balance = token === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted;
                      const equivalent = token === 'dmfUSD' ? gusdtUsdtEquivalent : gxautXautEquivalent;
                      const backingToken = token === 'dmfUSD' ? 'USDC' : 'EURC';
                      // Use 2 decimals for both tokens
                      const balanceDecimals = 2;
                      const equivalentDecimals = 2;
                      
                      return (
                        <div key={token} className="p-4 bg-white rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{token}</p>
                            <p className="text-xl font-bold text-gray-900 flex-shrink-0">{parseFloat(balance).toFixed(balanceDecimals)}</p>
                            {parseFloat(balance) > 0 && parseFloat(equivalent) > 0 && (
                              <p className="text-xs text-gray-600 flex-shrink-0">
                                ≈ {getCurrencySymbol(backingToken as 'USDC' | 'EURC')}{parseFloat(equivalent).toFixed(equivalentDecimals)} {backingToken}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeAction === 'Buy' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Buy</h2>
                    <div className="relative" ref={buyDropdownRef}>
                      <button
                        onClick={() => setIsBuyDropdownOpen(!isBuyDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                      >
                        {selectedBuyToken}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isBuyDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isBuyDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                          {(['dmfUSD', 'dmfEUR'] as const).map((token) => (
                            <button
                              key={token}
                              onClick={() => {
                                // Mark that currency change came from Buy dropdown (so we don't sync back)
                                currencyChangeSourceRef.current = 'buy';
                                setSelectedBuyToken(token);
                                setIsBuyDropdownOpen(false);
                                // Sync with buy tab and Available Balance currency (bidirectional)
                                if (token === 'dmfUSD') {
                                  setActiveBuyTab('dmfUSD');
                                  setSelectedCurrency('USDC');
                                } else if (token === 'dmfEUR') {
                                  setActiveBuyTab('dmfEUR');
                                  setSelectedCurrency('EURC');
                                }
                              }}
                              className={`w-full text-left px-4 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                                selectedBuyToken === token ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                              }`}
                            >
                              {token}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Purchase {selectedBuyToken} tokens using {selectedBuyToken === 'dmfUSD' ? 'USDC' : 'EURC'}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount ({selectedBuyToken === 'dmfUSD' ? 'USDC' : 'EURC'})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value)}
                        placeholder={`Min: 0.1 ${selectedBuyToken === 'dmfUSD' ? 'USDC' : 'EURC'}`}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-500">
                          Balance: <span className="font-semibold text-gray-700">
                            {getCurrencySymbol(selectedBuyToken === 'dmfUSD' ? 'USDC' : 'EURC')}{parseFloat(selectedBuyToken === 'dmfUSD' ? usdtBalanceFormatted : xautBalanceFormatted).toFixed(2)} {selectedBuyToken === 'dmfUSD' ? 'USDC' : 'EURC'}
                          </span>
                        </p>
                      </div>
                      {isLoadingEstimate && buyAmount && parseFloat(buyAmount) > 0 && (
                        <p className="mt-2 text-sm text-gray-500">Calculating...</p>
                      )}
                      {estimatedTokens && !isLoadingEstimate && !estimateError && (
                        <p className="mt-2 text-sm text-gray-600">
                          Estimated: ~{estimatedTokens} {selectedBuyToken}
                        </p>
                      )}
                      {estimateError && !isLoadingEstimate && (
                        <p className="mt-2 text-sm text-orange-500">
                          {estimateError instanceof Error && estimateError.message.includes('reverted') 
                            ? 'Unable to calculate estimate. Try a smaller amount.'
                            : `Error: ${estimateError instanceof Error ? estimateError.message : String(estimateError)}`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleBuyWithTracking}
                      disabled={
                        !buyAmount ||
                        parseFloat(buyAmount) < 0.1 ||
                        parseFloat(buyAmount) > parseFloat(selectedBuyToken === 'dmfUSD' ? usdtBalanceFormatted : xautBalanceFormatted) ||
                        isBuying ||
                        isConfirmingBuy ||
                        isApproving ||
                        isConfirmingApprove ||
                        isAwaitingBuy
                      }
                      className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-semibold"
                    >
                      {(isBuying || isConfirmingBuy || isApproving || isConfirmingApprove || isAwaitingBuy || (activeTransactionType === 'buy' && txStatus.buy !== 'failed')) ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {isApproving || isConfirmingApprove ? "Approving..." : isAwaitingBuy || isConfirmingBuy ? "Confirming..." : "Buying..."}
                        </>
                      ) : needsApproval ? (
                        "Approve & Buy"
                      ) : (
                        `Buy ${selectedBuyToken}`
                      )}
                    </button>
                    {buyHash && activeTransactionType === 'buy' && (
                      <div className="mt-4 space-y-2">
                        {txStatus.buy === 'success' && (
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-green-200 text-green-800 rounded-lg font-semibold cursor-default"
                          >
                            tx succeed
                          </button>
                        )}
                        {txStatus.buy === 'failed' && (
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-semibold cursor-default"
                          >
                            tx failed
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeAction === 'Interest' && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Accumulated Interest</h2>
                  <p className="text-sm text-gray-600 mb-4">Earn interest on your DMF holdings</p>
                  <div className="space-y-3">
                    {(['dmfUSD', 'dmfEUR'] as const)
                      .map((token) => {
                        const dividends = token === 'dmfUSD' ? pendingDividendsFormatted : pendingDividendsGxautFormatted;
                        return { token, dividends };
                      })
                      .filter(({ dividends }) => parseFloat(dividends) > 0)
                      .map(({ token, dividends }) => (
                        <div key={token} className="p-4 bg-white rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900 mb-1">{token}</p>
                              <p className="text-lg font-bold text-blue-600">
                                {getCurrencySymbol(token)}{parseFloat(dividends).toFixed(
                                  token === 'dmfEUR' ? 6 : 4
                                )}
                              </p>
                            </div>
                            <button
                              onClick={() => handleClaim(token)}
                              disabled={
                                isClaiming ||
                                isConfirmingClaim ||
                                parseFloat(dividends) <= 0 ||
                                (activeTransactionType === 'claim' && activeClaimToken !== token)
                              }
                              className="px-4 py-2 text-sm bg-blue-400 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center font-semibold"
                            >
                              {(isClaiming || isConfirmingClaim) && activeTransactionType === 'claim' && activeClaimToken === token && txStatus.claim !== 'failed' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Claim'
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {claimHash && (
                    <div className="mt-4 space-y-2">
                      {txStatus.claim === 'success' && (
                        <button
                          disabled
                          className="w-full px-4 py-2 bg-green-200 text-green-800 rounded-lg font-semibold cursor-default"
                        >
                          tx succeed
                        </button>
                      )}
                      {txStatus.claim === 'failed' && (
                        <button
                          disabled
                          className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-semibold cursor-default"
                        >
                          tx failed
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeAction === 'Refund' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Refund</h2>
                    <div className="relative" ref={refundDropdownRef}>
                      <button
                        onClick={() => setIsRefundDropdownOpen(!isRefundDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                      >
                        {selectedRefundToken}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isRefundDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isRefundDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                          {(['dmfUSD', 'dmfEUR'] as const).map((token) => (
                            <button
                              key={token}
                              onClick={() => {
                                setSelectedRefundToken(token);
                                setIsRefundDropdownOpen(false);
                                // Sync with refund tab and currency
                                if (token === 'dmfUSD') {
                                  setActiveRefundTab('dmfUSD');
                                  setSelectedCurrency('USDC');
                                } else if (token === 'dmfEUR') {
                                  setActiveRefundTab('dmfEUR');
                                  setSelectedCurrency('EURC');
                                }
                              }}
                              className={`w-full text-left px-4 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                                selectedRefundToken === token ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                              }`}
                            >
                              {token}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Refund {selectedRefundToken} tokens to receive {selectedRefundToken === 'dmfUSD' ? 'USDC' : 'EURC'}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount ({selectedRefundToken})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        max={selectedRefundToken === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder={`Min: 0.1 ${selectedRefundToken}`}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => setRefundAmount(selectedRefundToken === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Max: {getCurrencySymbol(selectedRefundToken)}{parseFloat(selectedRefundToken === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted).toFixed(2)}
                        </button>
                        <p className="text-xs text-gray-500">
                          Balance: <span className="font-semibold text-gray-700">{getCurrencySymbol(selectedRefundToken)}{parseFloat(selectedRefundToken === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted).toFixed(2)} {selectedRefundToken}</span>
                        </p>
                      </div>
                      {estimatedUsdt && (
                        <p className="mt-2 text-sm text-gray-600">
                          Estimated: ~{estimatedUsdt}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleRefundWithTracking}
                      disabled={
                        !refundAmount ||
                        parseFloat(refundAmount) < 0.1 ||
                        parseFloat(refundAmount) > parseFloat(selectedRefundToken === 'dmfUSD' ? gusdtBalanceFormatted : gxautBalanceFormatted) ||
                        isRefunding ||
                        isConfirmingRefund
                      }
                      className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-semibold"
                    >
                      {(isRefunding || isConfirmingRefund || (activeTransactionType === 'refund' && txStatus.refund !== 'failed')) ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {isConfirmingRefund ? "Confirming..." : "Refunding..."}
                        </>
                      ) : (
                        `Refund ${selectedRefundToken}`
                      )}
                    </button>
                    {refundHash && activeTransactionType === 'refund' && (
                      <div className="mt-4 space-y-2">
                        {txStatus.refund === 'success' && (
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-green-200 text-green-800 rounded-lg font-semibold cursor-default"
                          >
                            tx succeed
                          </button>
                        )}
                        {txStatus.refund === 'failed' && (
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-semibold cursor-default"
                          >
                            tx failed
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeAction === 'Faucet' && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ARC Testnet Faucet</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Get free testnet USDC and EURC to test the Digital Monetary Framework on ARC Testnet.
                  </p>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Circle Faucet</h3>
                      <p className="text-sm text-blue-800 mb-3">
                        Request testnet USDC and EURC tokens from Circle's public faucet:
                      </p>
                      <a
                        href="https://faucet.circle.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm underline"
                      >
                        Visit Circle Faucet →
                      </a>
                    </div>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">How to Connect to ARC Testnet</h3>
                      <p className="text-sm text-gray-700 mb-3">
                        Follow the official ARC documentation to add ARC Testnet to your wallet:
                      </p>
                      <a
                        href="https://docs.arc.network/arc/references/connect-to-arc"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm underline"
                      >
                        View ARC Connection Guide →
                      </a>
                      <div className="mt-3 text-xs text-gray-600 space-y-1">
                        <p><strong>Network Name:</strong> Arc Testnet</p>
                        <p><strong>RPC URL:</strong> https://rpc.testnet.arc.network</p>
                        <p><strong>Chain ID:</strong> 5042002</p>
                        <p><strong>Currency Symbol:</strong> USDC</p>
                        <p><strong>Block Explorer:</strong> https://testnet.arcscan.app</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
      </main>
      
      {/* Wallet Connect Dialog */}
      <WalletConnectDialog 
        open={isWalletDialogOpen} 
        onOpenChange={setIsWalletDialogOpen} 
      />
    </div>
  );
}

export default function Web3AppPage() {
  return (
    <Suspense fallback={
      <div className="font-jura min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <Web3AppPageContent />
    </Suspense>
  );
}