/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', 'wagmi', 'viem'],
  },
  // Webpack config to handle optional dependencies
  webpack: (config, { isServer, webpack }) => {
    // Ignore optional dependencies that aren't needed for browser builds
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    
    // Ignore these modules in webpack to prevent resolution errors
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
        contextRegExp: /node_modules/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^pino-pretty$/,
        contextRegExp: /node_modules/,
      })
    );
  
    // Suppress warnings for these optional dependencies
    config.ignoreWarnings = [
      { module: /@react-native-async-storage\/async-storage/ },
      { module: /pino-pretty/ },
    ];
    
    return config;
  },
};

module.exports = nextConfig;

