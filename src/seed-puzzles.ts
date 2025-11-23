import { puzzleDb } from "./database.js";

/**
 * Seed the database with 25 advent calendar puzzles
 */
export function seedPuzzles() {
    const puzzles: Array<{
        day: number;
        question: string;
        answer: string;
        hints: [string, string, string];
        category: string;
        difficulty: number;
    }> = [
            {
                day: 1,
                question: "I can be cracked, made, told, and played. What am I?",
                answer: "JOKE",
                hints: [
                    "You tell me to make people laugh",
                    "I can be good or bad",
                    "Comedians make me for a living"
                ],
                category: "Riddle",
                difficulty: 1,
            },
            {
                day: 2,
                question: "Which country has appeared in every FIFA World Cup since 1930?",
                answer: "BRAZIL",
                hints: [
                    "This country has won the World Cup 5 times",
                    "Famous for samba and football",
                    "Home to Pelé and Neymar"
                ],
                category: "Sports",
                difficulty: 2,
            },
            {
                day: 3,
                question: "What do you call the first block in a blockchain?",
                answer: "GENESIS",
                hints: [
                    "It means 'beginning' or 'origin'",
                    "Bitcoin's was mined in 2009",
                    "It's the foundation of every blockchain"
                ],
                category: "Crypto",
                difficulty: 1,
            },
            {
                day: 4,
                question: "Which athlete has the most Olympic gold medals in history?",
                answer: "Michael Phelps",
                hints: [
                    "He's a swimmer from the USA",
                    "He has 23 Olympic gold medals",
                    "Known as the 'Flying Fish'"
                ],
                category: "Sports",
                difficulty: 2,
            },
            {
                day: 5,
                question: "I have branches, but no fruit, trunk, or leaves. What am I?",
                answer: "BANK",
                hints: [
                    "You can deposit money in me",
                    "I have multiple locations",
                    "I'm a financial institution"
                ],
                category: "Riddle",
                difficulty: 1,
            },
            {
                day: 6,
                question: "Which club has won the most UEFA Champions League titles?",
                answer: "REAL MADRID",
                hints: [
                    "This Spanish club is based in the capital",
                    "They've won 14 Champions League titles",
                    "Their stadium is the Santiago Bernabéu"
                ],
                category: "Sports",
                difficulty: 2,
            },
            {
                day: 7,
                question: "What has one eye but can't see?",
                answer: "NEEDLE",
                hints: [
                    "Used for sewing",
                    "Has a hole at one end",
                    "Thread goes through me"
                ],
                category: "Riddle",
                difficulty: 1,
            },
            {
                day: 8,
                question: "What token standard introduced NFTs?",
                answer: "ERC721",
                hints: [
                    "It's an Ethereum standard",
                    "Each token is unique",
                    "The number comes after ERC"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 9,
                question: "What speaks without a mouth and hears without ears?",
                answer: "ECHO",
                hints: [
                    "You hear me in mountains or caves",
                    "I repeat what you say",
                    "I'm a sound reflection"
                ],
                category: "Riddle",
                difficulty: 2,
            },
            {
                day: 10,
                question: "What do we call assets that exist natively only on one chain but are copied via bridges?",
                answer: "Wrapped tokens",
                hints: [
                    "Think of WBTC or WETH",
                    "They represent the original asset",
                    "The first word describes being covered"
                ],
                category: "Crypto",
                difficulty: 3,
            },
            {
                day: 11,
                question: "Who is the current men's football (soccer) world champion?",
                answer: "ARGENTINA",
                hints: [
                    "They won the 2022 World Cup in Qatar",
                    "Lionel Messi plays for this country",
                    "Their flag is blue and white"
                ],
                category: "Sports",
                difficulty: 1,
            },
            {
                day: 12,
                question: "Where will Devcon 8 be hosted?",
                answer: "Mumbai",
                hints: [
                    "It's in India",
                    "One of the largest cities in the world",
                    "Known as the financial capital of India"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 13,
                question: "Which Ethereum upgrade first introduced burning base fees and changed the gas market?",
                answer: "London",
                hints: [
                    "It's named after a major city",
                    "Introduced EIP-1559",
                    "Made ETH deflationary"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 14,
                question: "What do we call a transaction that expresses what outcome a user wants, instead of how to execute it, and is later filled by solvers?",
                answer: "Intents",
                hints: [
                    "They express user goals, not steps",
                    "Solvers compete to fulfill them",
                    "The word means 'purposes' or 'goals'"
                ],
                category: "Crypto",
                difficulty: 3,
            },
            {
                day: 15,
                question: "Who is the youngest F1 World Champion in history?",
                answer: "VETTEL",
                hints: [
                    "He's a German driver",
                    "Won his first title in 2010",
                    "He was 23 years old"
                ],
                category: "Sports",
                difficulty: 3,
            },
            {
                day: 16,
                question: "What is the rollup type that uses fraud proofs rather than validity proofs?",
                answer: "OPTIMISTIC ROLLUP",
                hints: [
                    "Assumes transactions are valid by default",
                    "Arbitrum and Optimism use this",
                    "The first word means 'hopeful'"
                ],
                category: "Crypto",
                difficulty: 3,
            },
            {
                day: 17,
                question: "Shake me and I ring, but I'm not a phone. Tip me and I spill, but not liquid. What am I?",
                answer: "BELLS",
                hints: [
                    "Associated with Christmas",
                    "Make a jingling sound",
                    "Often found on sleighs"
                ],
                category: "Riddle",
                difficulty: 2,
            },
            {
                day: 18,
                question: "I remember everything but understand nothing. I never forget your mistakes. What am I?",
                answer: "LEDGER",
                hints: [
                    "I keep permanent records",
                    "Blockchain is a type of me",
                    "Accountants use me"
                ],
                category: "Riddle",
                difficulty: 2,
            },
            {
                day: 19,
                question: "I decide winners no one remembers and losers no one forgives. What am I?",
                answer: "SCOREBOARD",
                hints: [
                    "You see me at sporting events",
                    "I display points and time",
                    "I show who's winning"
                ],
                category: "Riddle",
                difficulty: 2,
            },
            {
                day: 20,
                question: "Which tennis player holds the record for most weeks as world #1 (men)?",
                answer: "DJOKOVIC",
                hints: [
                    "He's from Serbia",
                    "Has won 24 Grand Slam titles",
                    "Known for his flexibility"
                ],
                category: "Sports",
                difficulty: 2,
            },
            {
                day: 21,
                question: "What iconic Ethereum conference is known for sleeping bags, no hotel rooms, and hacker basement culture?",
                answer: "ETHDENVER",
                hints: [
                    "It's held in Colorado",
                    "One of the largest Ethereum events",
                    "Known for its BUIDL culture"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 22,
                question: "What is the term used for 'scraping MEV before inclusion,' often seen as harmful to users?",
                answer: "FRONTRUNNING",
                hints: [
                    "Bots do this in the mempool",
                    "It's a form of MEV extraction",
                    "Involves getting ahead of other transactions"
                ],
                category: "Crypto",
                difficulty: 3,
            },
            {
                day: 23,
                question: "At ETHDenver, what iconic hybrid utensil is given to attendees as a symbol of both 'forking' and 'building' together?",
                answer: "SPORK",
                hints: [
                    "It's a combination of two utensils",
                    "Fork + Spoon = ?",
                    "Represents blockchain forks"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 24,
                question: "What mechanism allows NFT creators to earn a percentage on every secondary sale?",
                answer: "ROYALTIES",
                hints: [
                    "Musicians and artists earn these",
                    "It's a percentage of each sale",
                    "Programmed into smart contracts"
                ],
                category: "Crypto",
                difficulty: 2,
            },
            {
                day: 25,
                question: "What is the process of permanently writing NFT metadata onto the blockchain?",
                answer: "ONCHAIN",
                hints: [
                    "Opposite of off-chain storage",
                    "More expensive but permanent",
                    "Data lives on the blockchain forever"
                ],
                category: "Crypto",
                difficulty: 2,
            },
        ];

    for (const puzzle of puzzles) {
        try {
            puzzleDb.insertPuzzle(
                puzzle.day,
                puzzle.question,
                puzzle.answer,
                puzzle.hints,
                puzzle.category,
                puzzle.difficulty
            );
        } catch (error) {
            console.log(`ℹ️  Puzzle for Day ${puzzle.day} already exists`);
        }
    }

    console.log("✅ All puzzles seeded");
}
