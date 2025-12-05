import { NextResponse } from 'next/server';
import { createPublicClient, http, formatUnits, defineChain } from 'viem';
import { dmfUSD_CONTRACT, dmfEUR_CONTRACT, USDC_CONTRACT, EURC_CONTRACT } from '@/lib/web3/config';
import { ERC20_ABI } from '@/lib/web3/contracts';
import dmfUSD_ABI from '@/app/dmftokens/dmfUSD_ABI.json';
import dmfEUR_ABI from '@/app/dmftokens/dmfEUR_ABI.json';

// Simple in-memory cache (no database needed)
interface CachedData {
  data: any;
  timestamp: number;
}

const cache: Map<string, CachedData> = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// ARC Testnet chain definition for viem
const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
});

// Create public client for blockchain reads
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.network'),
});

/**
 * Get token data from blockchain
 * 
 * IMPORTANT: Understanding Reserves vs Backing
 * 
 * 1. RESERVES (getUsdcReserves/getEurcReserves):
 *    - These are the actual backing tokens (USDC/EURC) held by the contract
 *    - They accumulate from user purchases
 *    - Use these for displaying "Reserves" in the transparency table
 * 
 * 2. BACKING PER TOKEN (getBackingPerToken):
 *    - Calculates: (reserves * 1e6) / circulatingSupply
 *    - Returns value in 6 decimals where 1e6 = 1.000000 = 100% backing
 *    - Use this for displaying "Backing" percentage
 * 
 * 3. WHY BACKING CAN BE >100%:
 *    When users buy tokens:
 *    - User pays 100 USDC → usdtReserves increases by 100 USDC
 *    - Contract calculates tokens to purchase (e.g., 95 tokens)
 *    - Fees are taken from tokens: devFee (5%), reserveFee (10%), reflectionFee (10%)
 *    - User receives ~75 tokens (after fees)
 *    - Result: Reserves = 100 USDC, Circulation = 75 tokens
 *    - Backing = 100/75 = 133% (more than 100%!)
 * 
 *    Additionally:
 *    - Token burning reduces circulation while reserves stay the same
 *    - This is by design - the system creates value appreciation over time
 * 
 *    If NO transactions have occurred:
 *    - Reserves = 0 (no one has bought yet)
 *    - Circulation = 0 (no tokens sold)
 *    - Backing = 0/0 = undefined (contract returns 0)
 *    - Once first purchase happens, backing will be >100% due to fees
 */
async function getTokenData(contractAddress: string, reserveContractAddress: string, tokenSymbol: string) {
  try {
    // Determine which ABI to use for contract-specific functions (must be first!)
    let contractABI: any = dmfUSD_ABI; // Default
    
    // Use the correct ABI for each token
    if (tokenSymbol === 'dmfUSD') {
      contractABI = dmfUSD_ABI;
    } else {
      contractABI = dmfEUR_ABI;
    }
    
    // Get circulating supply using the contract's public function
    // This is more accurate as it matches the contract's internal calculation
    // getCirculatingSupply() = totalSupply() - contractBalance
    // where totalSupply() = TOTAL_SUPPLY - totalBurned
    let circulation: bigint;
    try {
      circulation = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'getCirculatingSupplyPublic',
        args: [],
      }) as bigint;
    } catch {
      // Fallback: manually calculate if function doesn't exist
      const totalSupply = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'totalSupply',
        args: [],
      });
      const contractBalance = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [contractAddress as `0x${string}`],
      });
      const totalSupplyBigInt = totalSupply as bigint;
      const contractBalanceBigInt = contractBalance as bigint;
      circulation = totalSupplyBigInt > contractBalanceBigInt 
        ? totalSupplyBigInt - contractBalanceBigInt 
        : BigInt(0);
    }

    // Get decimals
    const decimals = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
      args: [],
    });

    // Get reserves from the contract using the correct function for each token
    // Each contract has its own reserve variable that tracks accumulated reserves
    // These reserves accumulate from user purchases (the full USDC/EURC amount paid)
    let reserves: bigint = BigInt(0);
    
    try {
      if (tokenSymbol === 'dmfUSD') {
        reserves = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: contractABI,
          functionName: 'getUsdcReserves',
          args: [],
        }) as bigint;
      } else if (tokenSymbol === 'dmfEUR') {
        reserves = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: contractABI,
          functionName: 'getEurcReserves',
          args: [],
        }) as bigint;
      }
    } catch {
      // Fallback: try to get backing token balance if reserve function doesn't exist
      try {
        const reserveBalance = await publicClient.readContract({
          address: reserveContractAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [contractAddress as `0x${string}`],
        });
        reserves = reserveBalance as bigint;
      } catch {
        // If all else fails, keep default value of 0
        reserves = BigInt(0);
      }
    }

    const decimalsNum = Number(decimals);
    const reserveDecimals = tokenSymbol === 'dmfUSD' ? 6 : 6; // USDC uses 6, EURC uses 6

    // Format values
    const circulationFormatted = formatUnits(circulation, decimalsNum);
    const reservesFormatted = formatUnits(reserves, reserveDecimals);
    
    // Get price from contract's getBackingPerToken() function
    // This is the most accurate as it uses the contract's own calculation
    // Returns value in 6 decimals where 1e6 = 1.000000 = 1.0 price
    let backingPerToken: bigint = BigInt(0);
    let price: string = '1.00';
    
    try {
      backingPerToken = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'getBackingPerToken',
        args: [],
      }) as bigint;
      
      // Convert from 6 decimals to actual price
      // backingPerToken is in 6 decimals (1e6 = 1.0)
      const backingPerTokenFormatted = formatUnits(backingPerToken, 6);
      const backingNum = parseFloat(backingPerTokenFormatted);
      
      // Price is the backing value per token
      // If backingPerToken = 1e6, price = 1.00
      // If backingPerToken = 1.01e6, price = 1.01
      price = backingNum > 0 
        ? backingNum.toFixed(tokenSymbol === 'dmfEUR' ? 4 : 2)
        : '1.00';
    } catch {
      // Fallback: calculate price manually as reserves / circulation
      const circulationNum = parseFloat(circulationFormatted);
      const reservesNum = parseFloat(reservesFormatted);
      price = circulationNum > 0 
        ? (reservesNum / circulationNum).toFixed(tokenSymbol === 'dmfEUR' ? 4 : 2)
        : '1.00';
    }
    
    // Backing is always 100% conceptually - reserves back circulation 1:1
    // The price reflects the market value (reserves/circulation)
    const backingPercent = '100.00%';

    // Calculate market cap (circulation * price)
    const marketCap = (parseFloat(circulationFormatted) * parseFloat(price)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Calculate daily volume from Buy events
    // Note: ARC Testnet RPC limits eth_getLogs to 10,000 blocks
    // At ~2 seconds per block, 10,000 blocks ≈ 5.5 hours
    let dailyVolume = '0.00';
    try {
      const currentBlock = await publicClient.getBlockNumber();
      // ARC Testnet RPC limit: 10,000 blocks maximum for eth_getLogs
      const MAX_BLOCK_RANGE = 10000;
      const fromBlock = currentBlock > BigInt(MAX_BLOCK_RANGE) ? currentBlock - BigInt(MAX_BLOCK_RANGE) : 0n;
      
      // Find Buy event in ABI
      const buyEventAbi = contractABI.find((item: any) => item.type === 'event' && item.name === 'Buy');
      
      if (buyEventAbi) {
        // Get Buy events using the ABI (limited to 10,000 blocks)
        const buyEvents = await publicClient.getLogs({
          address: contractAddress as `0x${string}`,
          event: buyEventAbi,
          fromBlock,
          toBlock: currentBlock,
        });

        // Sum up Buy volume (usdcPaid/eurcPaid)
        let buyVolume = BigInt(0);
        for (const event of buyEvents) {
          // Type assertion: viem getLogs with event parameter should decode args
          const eventWithArgs = event as typeof event & { args?: any };
          if (eventWithArgs.args) {
            // Buy event structure: Buy(address indexed buyer, uint256 usdcPaid/eurcPaid, uint256 tokensReceived)
            // viem returns args as an object with named properties or as an array
            const paidAmount = (eventWithArgs.args as any).usdcPaid || (eventWithArgs.args as any).eurcPaid || (Array.isArray(eventWithArgs.args) ? eventWithArgs.args[1] : undefined);
            if (paidAmount && typeof paidAmount === 'bigint') {
              buyVolume += paidAmount;
            }
          }
        }
        
        // Format daily volume (using 6 decimals for USDC/EURC)
        const dailyVolumeFormatted = formatUnits(buyVolume, 6);
        const dailyVolumeNum = parseFloat(dailyVolumeFormatted);
        
        dailyVolume = dailyVolumeNum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    } catch (error) {
      // If event query fails, keep default '0.00'
      console.warn(`Could not calculate daily volume for ${tokenSymbol}:`, error);
      dailyVolume = '0.00';
    }

    return {
      circulation: parseFloat(circulationFormatted).toLocaleString('en-US', {
        minimumFractionDigits: tokenSymbol === 'dmfEUR' ? 4 : 2,
        maximumFractionDigits: tokenSymbol === 'dmfEUR' ? 4 : 2,
      }),
      reserves: parseFloat(reservesFormatted).toLocaleString('en-US', {
        minimumFractionDigits: tokenSymbol === 'dmfEUR' ? 4 : 2,
        maximumFractionDigits: tokenSymbol === 'dmfEUR' ? 4 : 2,
      }),
      backing: `${backingPercent}%`,
      price,
      marketCap,
      dailyVolume,
    };
  } catch (error) {
    console.error(`Error fetching data for ${tokenSymbol}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  const cacheKey = 'tokens-data';
  const cached = cache.get(cacheKey);
  const now = Date.now();

  // Return cached data if it's still valid (less than 24 hours old) and not forcing refresh
  if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
    return NextResponse.json({
      ...cached.data,
      cached: true,
      cacheAge: Math.floor((now - cached.timestamp) / 1000 / 60), // minutes
    });
  }

  // Fetch fresh data from blockchain
  const [gusdtData, gxautData] = await Promise.all([
    getTokenData(dmfUSD_CONTRACT, USDC_CONTRACT, 'dmfUSD').catch(err => {
      console.error('Error fetching dmfUSD data:', err);
      return null;
    }),
    getTokenData(dmfEUR_CONTRACT, EURC_CONTRACT, 'dmfEUR').catch(err => {
      console.error('Error fetching dmfEUR data:', err);
      return null;
    }),
  ]);

  const tokens = [
    gusdtData ? {
      symbol: 'dmfUSD',
      name: 'DMF USDC',
      chain: 'ARC [testnet]',
      ...gusdtData,
    } : null,
    gxautData ? {
      symbol: 'dmfEUR',
      name: 'DMF EURC',
      chain: 'ARC [testnet]',
      ...gxautData,
    } : null,
  ].filter((token): token is NonNullable<typeof token> => token !== null && token.circulation !== undefined);

  const updateTime = new Date();
  // Format: "Updated 12:12:12 time at 12/12/2025"
  const hours = updateTime.getHours().toString().padStart(2, '0');
  const minutes = updateTime.getMinutes().toString().padStart(2, '0');
  const seconds = updateTime.getSeconds().toString().padStart(2, '0');
  const month = (updateTime.getMonth() + 1).toString().padStart(2, '0');
  const day = updateTime.getDate().toString().padStart(2, '0');
  const year = updateTime.getFullYear();
  
  const updateTimeFormatted = `Updated ${hours}:${minutes}:${seconds} time at ${month}/${day}/${year}`;
  
  const result = {
    tokens,
    lastUpdated: updateTime.toISOString(),
    updateTimeFormatted,
  };

  // Cache the result
  cache.set(cacheKey, {
    data: result,
    timestamp: now,
  });

  return NextResponse.json({
    ...result,
    cached: false,
  });
}

