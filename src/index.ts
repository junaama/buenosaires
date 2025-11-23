import * as fs from "fs";
import {
    AgentKit,
    cdpApiActionProvider,
    cdpEvmWalletActionProvider,
    CdpEvmWalletProvider,
    CdpEvmWalletActionProvider,
    erc20ActionProvider,
    onrampActionProvider,
} from "@coinbase/agentkit";
import { Agent, validHex } from "@xmtp/agent-sdk";
import { getTestUrl } from "@xmtp/agent-sdk/debug";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import { loadEnvFile } from "./utils/general.js";
import { USDCHandler } from "./utils/usdc.js";
import { getTopBaseTokens, pickRandomToken, type TokenInfo } from "./utils/tokens.js";
import type { MessageContext } from "@xmtp/agent-sdk";
import { userDb, answerDb, puzzleDb, puzzleSendDb, transactionDb, leaderboardDb, hintDb } from "./database.js";
import { seedPuzzles } from "./seed-puzzles.js";
import { startScheduler } from "./scheduler.js";
import { encodeFunctionData, parseAbi } from "viem";

loadEnvFile();

// Seed puzzles on startup
seedPuzzles();

// Storage constants
const WALLET_STORAGE_DIR = ".data/wallet";
const NETWORK_ID = process.env.NETWORK_ID || "base-sepolia";
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Pricing configuration (in USDC)
const ENTRY_FEE_USDC = parseFloat(process.env.ENTRY_FEE_USDC || "0.01");
const NICE_REWARD_USDC = parseFloat(process.env.NICE_REWARD_USDC || "0.001");
const NAUGHTY_REWARD_USDC = parseFloat(process.env.NAUGHTY_REWARD_USDC || "0.001");
const ONRAMP_PRESET_AMOUNT = parseFloat(process.env.ONRAMP_PRESET_AMOUNT || "10");

// CDP Wallet Provider
let walletProvider: CdpEvmWalletProvider | null = null;

let agentKit: AgentKit | null = null;
let cdpWalletActionProvider: CdpEvmWalletActionProvider | null = null;
let onrampProvider: any | null = null;

// USDC Handler
const usdcHandler = new USDCHandler(NETWORK_ID);

/**
 * Ensure local storage directory exists
 */
function ensureLocalStorage() {
    if (!fs.existsSync(WALLET_STORAGE_DIR)) {
        fs.mkdirSync(WALLET_STORAGE_DIR, { recursive: true });
    }
}

/**
 * Initialize CDP AgentKit with persistent wallet
 */
async function initializeAgentKit() {
    if (agentKit) return agentKit;

    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (!apiKeyId || !apiKeySecret || !walletSecret) {
        throw new Error("CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET must be set");
    }

    const walletAddressPath = `${WALLET_STORAGE_DIR}/wallet-address.txt`;
    let savedAddress: string | undefined;

    // Try to load existing wallet address
    if (fs.existsSync(walletAddressPath)) {
        savedAddress = fs.readFileSync(walletAddressPath, "utf-8").trim();
        console.log(`� Loading existing wallet: ${savedAddress}`);
    }

    // Create wallet provider (will reuse existing wallet if address is provided)
    walletProvider = await CdpEvmWalletProvider.configureWithWallet({
        apiKeyId,
        apiKeySecret,
        walletSecret,
        address: savedAddress as `0x${string}` | undefined,  // KEY: Reuse existing wallet if we have the address
        networkId: NETWORK_ID,
    });

    const walletData = await walletProvider.exportWallet();

    // Save address if this is a new wallet
    if (!savedAddress) {
        fs.writeFileSync(walletAddressPath, walletData.address);
        console.log(`🆕 Created new wallet: ${walletData.address}`);
        console.log(`💾 Wallet address saved to: ${walletAddressPath}`);
        console.log(`\n⚠️  IMPORTANT: Fund this wallet with USDC on ${NETWORK_ID}:`);
        console.log(`   Address: ${walletData.address}`);
        console.log(`   Faucet: https://faucet.circle.com/\n`);
    } else {
        console.log(`✅ Wallet loaded successfully`);
    }

    console.log(`💼 CDP Wallet Address: ${walletData.address}`);
    console.log(`🌐 Network: ${NETWORK_ID}`);

    cdpWalletActionProvider = cdpEvmWalletActionProvider();

    // Initialize onramp provider if CDP_PROJECT_ID is set
    if (process.env.CDP_PROJECT_ID) {
        onrampProvider = onrampActionProvider({ projectId: process.env.CDP_PROJECT_ID });
    }

    agentKit = await AgentKit.from({
        walletProvider,
        actionProviders: [
            erc20ActionProvider(),
            cdpApiActionProvider(),
            cdpWalletActionProvider,
            ...(onrampProvider ? [onrampProvider] : []),
        ],
    });

    return agentKit;
}

// Create XMTP Agent
const xmtpEnv = process.env.XMTP_ENV as "local" | "dev" | "production" | undefined;
const agent = await Agent.createFromEnv({
    env: xmtpEnv || "production",
});

// Handle incoming text messages
agent.on("text", async (ctx: MessageContext) => {
    if (!ctx.isDm()) {
        return;
    }

    const senderAddress = await ctx.getSenderAddress();
    if (!senderAddress) {
        console.error("No sender address found");
        return;
    }
    const messageContent = ctx.message.content;

    // Only handle text messages
    if (typeof messageContent !== "string") {
        console.log("Ignoring non-text message");
        return;
    }

    console.log(`Received: ${messageContent} from ${senderAddress} `);

    // Check if this is a JSON transaction reference sent as text
    try {
        const parsed = JSON.parse(messageContent);
        if (parsed.networkId && parsed.reference) {
            console.log("Detected transaction reference in text message:", parsed);

            // Mark user as paid in database
            let user = userDb.getUser(senderAddress);
            if (!user) {
                userDb.createUser(senderAddress);
            }

            userDb.updateUser(senderAddress, { paid: true });

            await ctx.sendText(
                `✅ Payment confirmed!\n` +
                `🔗 Network: ${parsed.networkId as string}\n` +
                `📄 Hash: ${parsed.reference as string}\n\n` +
                `🎅 Ho Ho Ho! Welcome to the Advent Calendar!\n` +
                `Type 'Day 1' to start your first puzzle!`
            );
            return;
        }
    } catch (e) {
        // Not JSON, continue with normal text handling
    }

    try {
        await handleMessage(ctx, senderAddress, messageContent);
    } catch (e) {
        console.error("Error handling message:", e);
    }
});

// Handle transaction references (payment confirmations)
agent.on("transaction-reference", async (ctx) => {
    console.log("🔔 Transaction reference event triggered!");

    const senderAddress = await ctx.getSenderAddress();
    if (!senderAddress) {
        console.error("No sender address found in transaction reference");
        return;
    }
    console.log(`Transaction reference from: ${senderAddress}`);

    // The XMTP SDK decodes the transaction reference content type automatically
    // Content is already the transaction reference object: { networkId, reference }
    const transactionRef = ctx.message.content as { networkId: string; reference: string };

    if (!transactionRef || !transactionRef.networkId || !transactionRef.reference) {
        console.error("Invalid transaction reference format");
        console.log("Message content:", ctx.message.content);
        return;
    }

    console.log("Received transaction reference: ", transactionRef);

    // Mark user as paid in database
    let user = userDb.getUser(senderAddress);
    if (!user) {
        userDb.createUser(senderAddress);
    }

    userDb.updateUser(senderAddress, { paid: true });

    await ctx.sendText(
        `✅ Payment received! Welcome to the Advent Calendar! 🎄\n\n` +
        `Your first puzzle will be available soon. Check back daily for new puzzles!`
    );
});

// Handle agent start
agent.on("start", async () => {
    console.log(`🤖 Advent Agent listening...`);
    console.log(`Address: ${agent.address} `);
    console.log(`🔗${getTestUrl(agent.client)} `);

    // Start the daily puzzle scheduler
    startScheduler(agent);
});

async function handleMessage(ctx: MessageContext, senderAddress: string, content: string) {
    const text = content.trim().toLowerCase();

    // Get or create user from database
    let user = userDb.getUser(senderAddress);
    if (!user) {
        userDb.createUser(senderAddress);
        user = userDb.getUser(senderAddress)!;
    }

    // --- COMMANDS ---
    if (text === "/help") {
        await ctx.sendText(
            `🎄 Advent Agent Commands 🎄\n\n` +
            `/help - Show this message\n` +
            `/leaderboard - Show top players\n` +
            `/stats - Show your statistics\n` +
            `/hint - Get a hint for the current puzzle`
        );
        return;
    }

    if (text === "/leaderboard") {
        const topUsers = leaderboardDb.getTopUsers(5);
        let message = "🏆 Advent Leaderboard 🏆\n\n";
        if (topUsers.length === 0) {
            message += "No scores yet! Be the first to answer correctly.";
        } else {
            topUsers.forEach((u: { address: string, correct_answers: number, avg_response_time: number | null }, i: number) => {
                message += `${i + 1}. ${u.address.slice(0, 6)}...${u.address.slice(-4)} - ${u.correct_answers} ⭐ (${(u.avg_response_time || 0).toFixed(1000)}s)\n`;
            });
        }
        await ctx.sendText(message);
        return;
    }

    if (text === "/stats") {
        const stats = answerDb.getUserStats(senderAddress);
        await ctx.sendText(
            `📊 Your Stats 📊\n\n` +
            `⭐ Correct Answers: ${stats.correct_answers || 'None yet'}\n` +
            `⚡ Avg Response Time: ${(stats.avg_response_time || 0).toFixed(1)}s\n` +
            `📅 Current Day: ${user.current_day}`
        );
        return;
    }

    // --- HINT COMMAND ---
    if (text === "/hint") {
        const day = user.current_day;
        const puzzle = puzzleDb.getPuzzle(day);
        if (!puzzle) {
            await ctx.sendText("No puzzle available for this day.");
            return;
        }
        const used = hintDb.getHintsUsed(senderAddress, day);
        // Determine which hint to send (0 -> hint1, 1 -> hint2, 2 -> hint3)
        let hint: string | null = null;
        if (used === 0 && puzzle.hint1) hint = puzzle.hint1;
        else if (used === 1 && puzzle.hint2) hint = puzzle.hint2;
        else if (used === 2 && puzzle.hint3) hint = puzzle.hint3;
        if (!hint) {
            await ctx.sendText("❌ No more hints available for this puzzle.");
            return;
        }
        // Record usage
        hintDb.incrementHintsUsed(senderAddress, day);
        await ctx.sendText(`💡 Hint: ${hint}`);
        return;
    }

    // --- STEP 1: GATEKEEPING ---
    if (!user.paid) {
        // Check if user wants to buy USDC
        if (text.includes("buy") || text.includes("fund") || text.includes("purchase")) {
            console.log("User wants to buy USDC");
            // Generate onramp URL to buy USDC
            if (onrampProvider) {
                try {
                    const walletData = await walletProvider!.exportWallet();
                    const onrampUrl = await onrampProvider.getOnrampBuyUrl(walletProvider!, {
                        addresses: {
                            [walletData.address]: ["base-sepolia"],
                        },
                        assets: ["USDC"],
                        defaultAsset: "USDC",
                        defaultNetwork: NETWORK_ID as "base-sepolia" | "base-mainnet",
                        presetFiatAmount: ONRAMP_PRESET_AMOUNT,
                    });

                    await ctx.sendText(
                        `💳 **Get Started for $${ONRAMP_PRESET_AMOUNT}**\n\n` +
                        `Click here to purchase with your debit card or bank account:\n` +
                        `${onrampUrl}\n\n` +
                        `Once complete, you'll automatically unlock the calendar!`
                    );
                    return;
                } catch (error) {
                    console.error("Onramp error:", error);
                    await ctx.sendText("⚠️ Sorry, I couldn't generate the buy link. Please try again later.");
                    return;
                }
            }
        }

        // Send payment request
        await ctx.sendText(
            `Welcome to the Advent Calendar! 🎄\n\n` +
            `Unlock 25 days of puzzles and crypto rewards for just $${ENTRY_FEE_USDC * 100}.\n\n` +
            `I'll send you a payment request now...`
        );

        // Create USDC payment request
        // do smaller amount for testing
        const agentAddress = agent.address;
        const amountInDecimals = ENTRY_FEE_USDC * Math.pow(10, 6);

        const walletSendCalls = usdcHandler.createUSDCTransferCalls(
            validHex(senderAddress),
            validHex(agentAddress),
            amountInDecimals
        );

        await ctx.conversation.send(walletSendCalls, ContentTypeWalletSendCalls);

        await ctx.sendText(
            `💡 Complete the payment and you'll be automatically unlocked!`
        );

        return;
    }

    // --- STEP 1.5: NAUGHTY OR NICE CHOICE ---
    if (user.pending_reward_choice) {
        const choice = text.toLowerCase();

        if (choice.includes("nice")) {
            // SAFE OPTION: Send USDC
            await ctx.sendText("😇 Nice choice! You'll receive your reward shortly...");

            try {
                const walletData = await walletProvider!.exportWallet();
                const amountInDecimals = NICE_REWARD_USDC * Math.pow(10, 6);

                console.log(`Sending ${NICE_REWARD_USDC} USDC to ${senderAddress}...`);

                // Encode transfer function call
                const USDC_ABI = parseAbi([
                    "function transfer(address to, uint256 amount) returns (bool)"
                ]);

                const data = encodeFunctionData({
                    abi: USDC_ABI,
                    functionName: "transfer",
                    args: [senderAddress as `0x${string}`, BigInt(amountInDecimals)]
                });

                const txHash = await walletProvider!.sendTransaction({
                    to: USDC_CONTRACT_ADDRESS as `0x${string}`,
                    data,
                });

                console.log(`Transaction sent: ${txHash}`);

                transactionDb.recordTransaction(
                    senderAddress,
                    user.current_day - 1,
                    NICE_REWARD_USDC.toString(),
                    txHash,
                    "USDC"
                );

                await ctx.sendText(`💸 Sent! Check your wallet.`);

            } catch (error) {
                console.error("Transfer error:", error);
                await ctx.sendText("⚠️ I couldn't send the prize right now. I'll try again later!");
            }

            // Clear pending state
            userDb.updateUser(senderAddress, { pending_reward_choice: false });

            await ctx.sendText(
                `� Great! Your next puzzle will unlock tomorrow. Check back then!`
            );
            return;

        } else if (choice.includes("naughty")) {
            // RISKY OPTION: Swap for Memecoin
            await ctx.sendText("😈 Feeling risky! Let's see what you get...");

            // Fetch top tokens from CoinGecko and pick a random one
            await ctx.sendText("🎲 Finding you a memecoin...");

            // MEMECOIN PATH - Always execute swap for Naughty

            const topTokens = await getTopBaseTokens(100);
            const memecoin = pickRandomToken(topTokens);

            await ctx.sendText(`🎯 You're getting $${memecoin.symbol}!`);

            // Check for BONUS (if they already hold the token)
            let bonusMultiplier = 1;
            try {
                const balance = await walletProvider!.readContract({
                    address: memecoin.address as `0x${string}`,
                    abi: parseAbi(["function balanceOf(address owner) view returns (uint256)"]),
                    functionName: "balanceOf",
                    args: [senderAddress as `0x${string}`]
                });

                if (balance && BigInt(balance as bigint) > 0n) {
                    bonusMultiplier = 2;
                    await ctx.sendText(`� Bonus! You already hold $${memecoin.symbol} - doubling your reward!`);
                }
            } catch (e) {
                console.log("Error checking user balance for bonus:", e);
            }

            // Execute Swap
            try {
                const amountUSDC = NAUGHTY_REWARD_USDC * bonusMultiplier;
                const amountInWei = BigInt(amountUSDC * Math.pow(10, 6));

                await ctx.sendText(`🔄 Swapping for $${memecoin.symbol}...`);

                // Execute the swap via CDP Action Provider directly
                if (!cdpWalletActionProvider) {
                    await initializeAgentKit();
                }

                const result = await cdpWalletActionProvider!.swap(walletProvider!, {
                    fromToken: USDC_CONTRACT_ADDRESS,
                    toToken: memecoin.address,
                    fromAmount: amountInWei.toString(),
                    slippageBps: 500, // 5%
                });

                // The result is usually a string message.
                await ctx.sendText(`✅ Done! Check your wallet for $${memecoin.symbol}`);

                transactionDb.recordTransaction(
                    senderAddress,
                    user.current_day - 1,
                    amountUSDC.toString(),
                    "SWAP_EXECUTED",
                    "SWAP"
                );

            } catch (error) {
                console.error("Swap error:", error);
                await ctx.sendText("Swap didn't work - sending you the reward directly instead.");
            }

            // Clear pending state
            userDb.updateUser(senderAddress, { pending_reward_choice: false });
            await ctx.sendText(`Nice! Your next puzzle will unlock tomorrow. See you then!`);
            return;

        } else {
            await ctx.sendText("Please choose: Reply with 'Naughty' or 'Nice'");
            return;
        }
    }

    // --- STEP 2: PUZZLE LOGIC ---
    const currentDay = user.current_day;
    const puzzle = puzzleDb.getPuzzle(currentDay);

    if (!puzzle) {
        await ctx.sendText("You have completed all the puzzles! Merry Christmas!");
        return;
    }

    // Check if they already received the puzzle
    const sentRecord = puzzleSendDb.getSendTime(senderAddress, currentDay);
    if (!sentRecord) {
        // Send the puzzle
        await ctx.sendText(
            `Day ${currentDay} Puzzle\n\n` +
            `${puzzle.question}\n\n` +
            `Reply with your answer!`
        );
        puzzleSendDb.recordSend(senderAddress, currentDay);
        return;
    }

    // --- STEP 3: ANSWER CHECKING ---
    // If they are replying, check if it's the correct answer
    if (text === puzzle.answer.toLowerCase()) {
        // Correct answer!
        const hintsUsed = hintDb.getHintsUsed(senderAddress, currentDay);

        answerDb.recordAnswer(
            senderAddress,
            currentDay,
            content,
            true,
            sentRecord,
            hintsUsed
        );

        const responseTime = (Date.now() - sentRecord.getTime()) / 1000;
        await ctx.sendText(`✅ Correct! You solved Day ${currentDay} in ${responseTime.toFixed(1)} seconds!`);

        // Advance to next day
        userDb.updateUser(senderAddress, { current_day: currentDay + 1, pending_reward_choice: true });

        // Ask Naughty or Nice
        await ctx.sendText(
            `🎅 Correct!\n\n` +
            `Choose your reward:\n` +
            `😇 Nice: Get your reward now (safe)\n` +
            `😈 Naughty: Swap for a random memecoin (risky, but could 10x!)\n\n` +
            `Reply: 'Nice' or 'Naughty'`
        );

    } else {
        // Incorrect answer
        const hintsUsed = hintDb.getHintsUsed(senderAddress, currentDay);
        answerDb.recordAnswer(
            senderAddress,
            currentDay,
            content,
            false,
            sentRecord,
            hintsUsed
        );
        await ctx.sendText("❌ Not quite! Try again. (Type /hint if you need help)");
    }
} // Closing brace for handleMessage function

// Helper: Verify Answer
function verifyAnswer(userAnswer: string, expectedAnswer: string): { isCorrect: boolean } {
    // Case-insensitive comparison
    return { isCorrect: expectedAnswer.toLowerCase() === userAnswer.toLowerCase() };
}


// Ensure storage exists
ensureLocalStorage();


// Initialize AgentKit
await initializeAgentKit();

// Start the agent
await agent.start();
