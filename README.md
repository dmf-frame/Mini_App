# DMF Mini App

A standalone installable mini app for the Digital Monetary Framework (DMF) token management system.

## Features

- **Buy DMF Tokens**: Purchase dmfUSD and dmfEUR tokens using USDC and EURC
- **Refund Tokens**: Refund DMF tokens back to their backing assets
- **Claim Interest**: Claim accumulated interest on your DMF holdings
- **Wallet Integration**: Connect with MetaMask, WalletConnect, and other popular wallets
- **ARC Testnet Support**: Built for ARC Testnet with native USDC support

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Set up WalletConnect:
   - Get a project ID from [WalletConnect Cloud](https://cloud.walletconnect.com)
   - Create a `.env.local` file:
     ```
     NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
     ```
   - **Note**: WalletConnect is optional. The app works with MetaMask and injected wallets without it. Each user should use their own project ID for security and proper usage tracking.

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Build for Production

```bash
npm run build
npm start
```

## Contract Addresses (ARC Testnet)

- **dmfUSD**: `0xc64BBc75B5e7C7A3C5bA3599230349452cCF57C8`
- **dmfEUR**: `0xde2db4E19485922b54E23f92Ca6dfFAd19c58472`
- **EURC**: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`

## Network Configuration

- **Network Name**: Arc Testnet
- **RPC URL**: https://rpc.testnet.arc.network
- **Chain ID**: 5042002
- **Currency Symbol**: USDC (native)
- **Block Explorer**: https://testnet.arcscan.app

## Getting Testnet Tokens

Visit [Circle Faucet](https://faucet.circle.com) to get free testnet USDC and EURC tokens.

## More Information

For more details about the Digital Monetary Framework, on-chain data, and token information, visit the main website: [dmfam.org](https://dmfam.org/).

## Technologies

- **Next.js 14**: React framework
- **Wagmi**: React hooks for Ethereum
- **Viem**: TypeScript Ethereum library
- **Tailwind CSS**: Styling
- **TypeScript**: Type safety

## License

MIT

