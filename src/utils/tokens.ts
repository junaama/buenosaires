import { CdpEvmWalletProvider } from "@coinbase/agentkit";

/**
 * Token info from external API
 */
export interface TokenInfo {
    symbol: string;
    address: string;
    name: string;
}

/**
 * Fetches top tokens on Base network from CoinGecko API
 * Falls back to hardcoded list if API fails
 */
export async function getTopBaseTokens(limit: number = 100): Promise<TokenInfo[]> {
    try {
        // Use CoinGecko API to get top tokens on Base
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=base-ecosystem&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`,
            {
                headers: {
                    'Accept': 'application/json',
                }
            }
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json() as any[];

        // Extract token addresses from the platforms.base field
        const tokens: TokenInfo[] = data
            .filter((token: any) => token.platforms?.base)
            .map((token: any) => ({
                symbol: token.symbol.toUpperCase(),
                address: token.platforms.base,
                name: token.name,
            }))
            .filter((token: TokenInfo) => token.address && token.address.startsWith('0x'));

        console.log(`✅ Fetched ${tokens.length} tokens from CoinGecko`);
        return tokens;

    } catch (error) {
        console.error('Error fetching tokens from CoinGecko:', error);
        console.log('⚠️ Falling back to hardcoded token list');

        // Fallback to hardcoded Base Sepolia test tokens
        return [
            {
                symbol: "DEGEN",
                address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
                name: "Degen",
            },
            {
                symbol: "TOSHI",
                address: "0xa62d2f01f8e0361b15f9596d5fd339fd00c9f717",
                name: "Toshi",
            },
            {
                symbol: "BRETT",
                address: "0x3363e87f0723d92685589a4d9a3195d47124dde0",
                name: "Brett",
            },
        ];
    }
}

/**
 * Picks a random token from the list
 */
export function pickRandomToken(tokens: TokenInfo[]): TokenInfo {
    return tokens[Math.floor(Math.random() * tokens.length)];
}
