import * as fs from "fs";
import {
    AgentKit,
    cdpApiActionProvider,
    cdpEvmWalletActionProvider,
    CdpEvmWalletProvider,
    erc20ActionProvider,
} from "@coinbase/agentkit";
import { Agent, validHex } from "@xmtp/agent-sdk";
import { getTestUrl } from "@xmtp/agent-sdk/debug";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import { loadEnvFile } from "./utils/general.js";
import { USDCHandler } from "./utils/usdc.js";
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
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// CDP Wallet Provider
let walletProvider: CdpEvmWalletProvider | null = null;
let agentKit: AgentKit | null = null;

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

    agentKit = await AgentKit.from({
        walletProvider,
        actionProviders: [
            erc20ActionProvider(),
            cdpApiActionProvider(),
            cdpEvmWalletActionProvider(),
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
    const senderAddress = await ctx.getSenderAddress();
    if (!senderAddress) {
        console.error("No sender address found");
        return;
    }

    // Check if this is actually a transaction reference
    // @ts-expect-error - Coinbase Wallet incorrectly wraps transaction references
    if (!ctx.message.content.transactionReference) {
        console.log("Received transaction-reference event but no transactionReference in content");
        return;
    }

    // Handle both standard format and Coinbase's incorrect nested format
    // @ts-expect-error - Coinbase Wallet incorrectly wraps transaction references
    let transactionRef = ctx.message.content.transactionReference;
    if (transactionRef.transactionReference) {
        transactionRef = transactionRef.transactionReference;
    }

    console.log("Received transaction reference: ", transactionRef);

    // Mark user as paid in database
    let user = userDb.getUser(senderAddress);
    if (!user) {
        userDb.createUser(senderAddress);
    }

    userDb.updateUser(senderAddress, { paid: true });

    await ctx.sendText(
        `✅ Payment confirmed!\n` +
        `🔗 Network: ${transactionRef.networkId as string}\n` +
        `📄 Hash: ${transactionRef.reference as string}\n\n` +
        `🎅 Ho Ho Ho! Welcome to the Advent Calendar!\n` +
        `Type 'Day 1' to start your first puzzle!`
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
            `🎄 **Advent Agent Commands** 🎄\n\n` +
            `/help - Show this message\n` +
            `/leaderboard - Show top players\n` +
            `/stats - Show your statistics\n` +
            `/hint - Get a hint for the current puzzle`
        );
        return;
    }

    if (text === "/leaderboard") {
        const topUsers = leaderboardDb.getTopUsers(5);
        let message = "🏆 **Advent Leaderboard** 🏆\n\n";
        if (topUsers.length === 0) {
            message += "No scores yet! Be the first to answer correctly.";
        } else {
            topUsers.forEach((u: { address: string, correct_answers: number, avg_response_time: number | null }, i: number) => {
                message += `${i + 1}. ${u.address.slice(0, 6)}...${u.address.slice(-4)} - ${u.correct_answers} ⭐ (${(u.avg_response_time || 0).toFixed(1)}s)\n`;
            });
        }
        await ctx.sendText(message);
        return;
    }

    if (text === "/stats") {
        const stats = answerDb.getUserStats(senderAddress);
        await ctx.sendText(
            `📊 **Your Stats** 📊\n\n` +
            `⭐ Correct Answers: ${stats.correct_answers}\n` +
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
        // Generate payment link
        const walletData = await walletProvider!.exportWallet();

        await ctx.sendText(
            `🎅 **Ho Ho Ho!** Welcome to the Advent Calendar Agent!\n\n` +
            `To join the fun and win daily prizes, you need to send **0.001 USDC** (Base Sepolia) to my wallet.\n\n` +
            `💰 **Wallet Address:**\n\`${walletData.address}\`\n\n` +
            `Once you've sent the funds, reply with the transaction hash or wait for me to detect it!`
        );
        return;
    }

    // --- STEP 2: PUZZLE LOGIC ---
    const currentDay = user.current_day;
    const puzzle = puzzleDb.getPuzzle(currentDay);

    if (!puzzle) {
        await ctx.sendText("🎉 You have completed all the puzzles! Merry Christmas!");
        return;
    }

    // Check if they already received the puzzle
    const sentRecord = puzzleSendDb.getSendTime(senderAddress, currentDay);
    if (!sentRecord) {
        // Send the puzzle
        await ctx.sendText(
            `🎁 **Day ${currentDay} Puzzle** 🎁\n\n` +
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
        await ctx.sendText(`✅ **Correct!** You solved Day ${currentDay} in ${responseTime.toFixed(1)} seconds!`);

        // Send Reward
        try {
            const walletData = await walletProvider!.exportWallet();
            // small amount for testing 0.01
            const amountInDecimals = 0.001 * Math.pow(10, 6);

            console.log(`Sending ${amountInDecimals} USDC (0.001 USDC) to ${senderAddress}...`);
            console.log(`From wallet: ${walletData.address}`);

            const balance = await walletProvider!.getBalance();
            console.log(`ETH Balance: ${balance.toString()} wei`);

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
                currentDay,
                "0.001",
                txHash
            );

            await ctx.sendText(`💸 **Prize Sent!** I've sent you 0.001 USDC as a reward.\nTx: https://sepolia.basescan.org/tx/${txHash}`);

        } catch (error) {
            console.error("Transfer error:", error);
            await ctx.sendText("⚠️ Correct, but I couldn't send the prize right now. I'll try again later!");
        }

        // Advance to next day
        userDb.updateUser(senderAddress, { current_day: currentDay + 1 });

        // Send next puzzle immediately? Or wait for them to type something?
        await ctx.sendText("Type 'next' or anything else to get the next puzzle!");

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
        await ctx.sendText("❌ Incorrect. Try again! (Type /hint for a clue)");
    }
} // Closing brace for handleMessage function

// Helper: Verify Answer
function verifyAnswer(userAnswer: string, expectedAnswer: string): { isCorrect: boolean } {
    // Case-insensitive comparison
    return { isCorrect: expectedAnswer.toLowerCase() === userAnswer.toLowerCase() };
}


// Ensure storage exists
ensureLocalStorage();


// Start the agent
await agent.start();
