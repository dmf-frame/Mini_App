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
export const dmfUSD_CONTRACT = '0x0C3c09b02bb03699f7a6348aE346008AE81e124a' as const; // dmfUSD on ARC Testnet (ERC-20 USDC backed)
export const dmfEUR_CONTRACT = '0xde2db4E19485922b54E23f92Ca6dfFAd19c58472' as const; // dmfEUR on ARC Testnet

// Backward compatibility aliases (deprecated, use dmfUSD_CONTRACT and dmfEUR_CONTRACT)
export const GUSDT_CONTRACT = dmfUSD_CONTRACT;
export const GXAUT_CONTRACT = dmfEUR_CONTRACT;
export const GUSDC_CONTRACT = dmfUSD_CONTRACT;
export const GEURC_CONTRACT = dmfEUR_CONTRACT;

// ARC Testnet USDC and EURC contract addresses
// Note: On ARC testnet, USDC and EURC are available via Circle's faucet
// EURC contract address on ARC testnet: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
export const EURC_CONTRACT = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const; // ARC testnet EURC
// ERC-20 USDC on ARC testnet (bridged via CCTP, 6 decimals)
export const USDC_CONTRACT = '0x3600000000000000000000000000000000000000' as const; // ERC-20 USDC on ARC (6 decimals)
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

