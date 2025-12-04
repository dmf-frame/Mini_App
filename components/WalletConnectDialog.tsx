"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccount, useConnect } from "wagmi";
import { Wallet, Smartphone, ExternalLink, ChevronRight, Sparkles, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { config } from "@/lib/web3/config";

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface WalletConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WalletConnectDialog = ({ open, onOpenChange }: WalletConnectDialogProps) => {
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);

  const metaMaskConnector = config.connectors.find(c => 
    c.name === 'MetaMask' || 
    c.id === 'metaMask'
  );
  const injectedConnector = config.connectors.find(c => 
    c.name === 'Injected' || 
    c.type === 'injected'
  );
  const walletConnectConnector = config.connectors.find(c => 
    c.name === 'WalletConnect' || 
    c.id === 'walletConnect' ||
    c.type === 'walletConnect'
  );
  const coinbaseConnector = config.connectors.find(c => 
    c.name === 'Coinbase Wallet' || 
    c.name === 'Coinbase' ||
    c.id === 'coinbaseWallet'
  );

  const detectInjectedWallet = () => {
    if (typeof window === 'undefined' || !window.ethereum) return null;
    
    if (window.ethereum.isRainbow) {
      return { name: 'Rainbow Wallet', icon: Sparkles, color: 'from-pink-400 to-pink-500' };
    }
    if (window.ethereum.isTrust) {
      return { name: 'Trust Wallet', icon: Shield, color: 'from-blue-500 to-blue-600' };
    }
    if (window.ethereum.isCoinbaseWallet) {
      return { name: 'Coinbase Wallet', icon: ExternalLink, color: 'from-cyan-400 to-violet-500' };
    }
    if (!window.ethereum.isMetaMask) {
      return { name: 'Injected Wallet', icon: Wallet, color: 'from-gray-400 to-gray-500' };
    }
    return null;
  };

  const detectedWallet = detectInjectedWallet();

  useEffect(() => {
    if (open && isConnected) {
      onOpenChange(false);
    }
  }, [open, isConnected, onOpenChange]);

  const handleMetaMask = async () => {
    try {
      setIsConnecting(true);
      
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not detected. Please install MetaMask extension.');
      }
      
      if (metaMaskConnector) {
        await connect({ connector: metaMaskConnector });
      } else {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts && accounts.length > 0) {
          console.log('✅ MetaMask connected directly, accounts:', accounts);
        } else {
          throw new Error('No accounts returned from MetaMask');
        }
      }
    } catch (error) {
      console.error('❌ MetaMask connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletConnect = async () => {
    const wcConnector = walletConnectConnector || config.connectors.find(c => 
      c.name === 'WalletConnect' || 
      c.id === 'walletConnect' ||
      c.type === 'walletConnect'
    );
    
    if (!wcConnector) {
      console.error('WalletConnect connector not found. Please ensure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set in your environment variables.');
      alert('WalletConnect is not configured. Please contact support or check your environment configuration.');
      return;
    }
    
    try {
      setIsConnecting(true);
      await connect({ connector: wcConnector });
    } catch (error) {
      console.error('WalletConnect error:', error);
      if (error instanceof Error) {
        if (error.message.includes('projectId') || error.message.includes('project ID')) {
          alert('WalletConnect requires a valid project ID. Please configure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment variables.');
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCoinbase = async () => {
    if (!coinbaseConnector) return;
    try {
      setIsConnecting(true);
      await connect({ connector: coinbaseConnector });
    } catch (error) {
      console.error('Coinbase connection error:', error);
      if (error instanceof Error && error.message.includes('metrics')) {
        console.warn('Coinbase metrics error suppressed - wallet connection still functional');
        return;
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleInjectedWallet = async (walletName: string) => {
    if (!injectedConnector) return;
    try {
      setIsConnecting(true);
      await connect({ connector: injectedConnector });
    } catch (error) {
      console.error(`${walletName} connection error:`, error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-200" onClose={() => onOpenChange(false)}>
        <DialogHeader>          
          <DialogTitle className="text-center">
            <div className="space-y-1">
              <div className="font-jura text-3xl font-bold text-gray-800">Digital Monetary Framework</div>
            </div>
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Choose your preferred wallet to connect to ARC network
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-6">
          <button 
            onClick={handleMetaMask}
            disabled={isConnecting}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${
              typeof window !== 'undefined' && window.ethereum 
                ? 'bg-gradient-to-r from-orange-400 to-orange-500 text-white hover:from-orange-300 hover:to-orange-400 shadow-lg' 
                : 'bg-gray-300 text-gray-600 opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5" />
              <span className="font-medium">
                MetaMask
                {typeof window !== 'undefined' && !window.ethereum && (
                  <span className="text-xs block text-red-200">Not detected</span>
                )}
              </span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button 
            onClick={handleWalletConnect}
            disabled={isConnecting}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-400 to-blue-500 text-white hover:from-blue-300 hover:to-blue-400 shadow-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5" />
              <span className="font-medium">WalletConnect</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>

          {coinbaseConnector && !detectedWallet?.name.includes('Coinbase') && (
            <button 
              onClick={handleCoinbase}
              disabled={isConnecting}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-300 to-blue-400 text-white hover:from-blue-200 hover:to-blue-300 shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5" />
                <span className="font-medium">Coinbase Wallet</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {detectedWallet && injectedConnector && (() => {
            const IconComponent = detectedWallet.icon;
            return (
              <button 
                onClick={() => handleInjectedWallet(detectedWallet.name)}
                disabled={isConnecting}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r ${detectedWallet.color} text-white hover:opacity-90 shadow-lg transition-all`}
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="w-5 h-5" />
                  <span className="font-medium">{detectedWallet.name}</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>
            );
          })()}

          {isConnecting && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Connecting...</p>
            </div>
          )}

          <div className="text-xs text-gray-500 text-center mt-4 space-y-1">
            <p>Make sure your wallet is connected to <span className="text-blue-600 font-semibold">ARC Testnet</span></p>
            <p>WalletConnect supports 300+ wallets including Trust Wallet, and more</p>
            {typeof window !== 'undefined' && !window.ethereum && (
              <p className="text-orange-500">
                💡 Install MetaMask extension for the best experience
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

