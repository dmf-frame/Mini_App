import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { metaMask, injected } from 'wagmi/connectors';

// ARC Testnet chain definition
export const arcTestnet = defineChain({
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

// ARC Testnet contract addresses
export const dmfUSD_CONTRACT = '0xc64BBc75B5e7C7A3C5bA3599230349452cCF57C8' as const; // dmfUSD on ARC Testnet
export const dmfEUR_CONTRACT = '0xde2db4E19485922b54E23f92Ca6dfFAd19c58472' as const; // dmfEUR on ARC Testnet

// Backward compatibility aliases (deprecated, use dmfUSD_CONTRACT and dmfEUR_CONTRACT)
export const GUSDT_CONTRACT = dmfUSD_CONTRACT;
export const GXAUT_CONTRACT = dmfEUR_CONTRACT;
export const GUSDC_CONTRACT = dmfUSD_CONTRACT;
export const GEURC_CONTRACT = dmfEUR_CONTRACT;

// ARC Testnet USDC and EURC contract addresses
// Note: On ARC testnet, USDC and EURC are available via Circle's faucet
// USDC is the native gas token on ARC testnet (18 decimals)
// EURC contract address on ARC testnet: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
export const EURC_CONTRACT = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const; // ARC testnet EURC
// USDC on ARC testnet uses native token (no contract address needed for native USDC)
// For ERC20 USDC operations, we may need the actual USDC contract address if different from native
export const USDC_CONTRACT = '0x0000000000000000000000000000000000000000' as const; // Native USDC on ARC (18 decimals)
export const USDT_CONTRACT = USDC_CONTRACT; // Alias for backward compatibility

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  metaMask(),
  injected({ shimDisconnect: true }),
];

export const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}

