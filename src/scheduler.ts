import cron from "node-cron";
import { Agent } from "@xmtp/agent-sdk";
import { userDb, puzzleDb, puzzleSendDb } from "./database.js";

/**
 * Start the daily puzzle scheduler
 * @param agent XMTP Agent instance
 */
export function startScheduler(agent: Agent) {
    console.log("⏰ Scheduler started. Puzzles will be sent daily at 6:00 AM.");

    // Schedule task for 6:00 AM every day
    cron.schedule("0 6 * * *", async () => {
        console.log("⏰ Running daily puzzle distribution...");
        await distributeDailyPuzzles(agent);
    });
}

/**
 * Distribute puzzles for the current day to all paid users
 * @param agent XMTP Agent instance
 */
export async function distributeDailyPuzzles(agent: Agent) {
    // Calculate current day based on December 1st start
    // For demo purposes, we'll use the user's current_day or a global day
    // In a real advent calendar, this would be strictly date-based:
    // const today = new Date();
    // const day = today.getDate(); // Assuming December

    // For this implementation, we'll iterate through all paid users and send them
    // the puzzle for their current_day if they haven't received it yet.

    const users = userDb.getAllPaidUsers();
    console.log(`Checking ${users.length} users for puzzle distribution...`);

    for (const user of users) {
        try {
            const day = user.current_day;

            // Check if puzzle exists for this day
            const puzzle = puzzleDb.getPuzzle(day);
            if (!puzzle) {
                console.log(`No puzzle found for day ${day}, skipping user ${user.address}`);
                continue;
            }

            // Check if already sent today (or for this puzzle day)
            const lastSent = puzzleSendDb.getSendTime(user.address, day);
            if (lastSent) {
                // Already sent this puzzle
                continue;
            }

            console.log(`Sending Day ${day} puzzle to ${user.address}...`);

            // Send the puzzle
            const conversation = await (agent.client as any).conversations.newConversation(user.address);
            await conversation.send(`🎄 **DECEMBER ${day}** 🎄\n\n${puzzle.question}\n\n(Reply with your answer!)`);

            // Record send time
            puzzleSendDb.recordSend(user.address, day);

        } catch (error) {
            console.error(`Failed to send puzzle to ${user.address}:`, error);
        }
    }

    console.log("✅ Daily puzzle distribution complete");
}
