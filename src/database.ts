import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

const DB_DIR = ".data";
const DB_FILE = path.join(DB_DIR, "advent.db");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_FILE);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

/**
 * Initialize database schema
 */
export function initializeDatabase() {
    // Users table
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      paid BOOLEAN DEFAULT 0,
      current_day INTEGER DEFAULT 1,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      timezone TEXT DEFAULT 'UTC'
    )
  `);

    // Answer submissions table
    db.exec(`
    CREATE TABLE IF NOT EXISTS answer_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      day INTEGER NOT NULL,
      answer TEXT NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      puzzle_sent_at DATETIME,
      response_time_ms INTEGER,
      is_correct BOOLEAN DEFAULT 0,
      hints_used INTEGER DEFAULT 0,
      FOREIGN KEY (user_address) REFERENCES users(address),
      UNIQUE(user_address, day)
    )
  `);

    // Puzzles table
    db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      day INTEGER PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      hint1 TEXT,
      hint2 TEXT,
      hint3 TEXT,
      category TEXT,
      difficulty INTEGER DEFAULT 1
    )
  `);

    // Transactions table
    db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      day INTEGER NOT NULL,
      tx_hash TEXT,
      amount TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

    // Puzzle sends tracking (for response time calculation)
    db.exec(`
    CREATE TABLE IF NOT EXISTS puzzle_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      day INTEGER NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_address) REFERENCES users(address),
      UNIQUE(user_address, day)
    )
  `);

    // Hint usage tracking
    db.exec(`
    CREATE TABLE IF NOT EXISTS hint_usage (
      user_address TEXT,
      day INTEGER,
      hints_used INTEGER DEFAULT 0,
      PRIMARY KEY (user_address, day)
    )
  `);

    // Create indexes for common queries
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_answers_user_day ON answer_submissions(user_address, day);
    CREATE INDEX IF NOT EXISTS idx_answers_correct ON answer_submissions(is_correct);
    CREATE INDEX IF NOT EXISTS idx_answers_response_time ON answer_submissions(response_time_ms);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_address);
    CREATE INDEX IF NOT EXISTS idx_puzzle_sends_user_day ON puzzle_sends(user_address, day);
  `);

    console.log("✅ Database initialized");
}

/**
 * User operations
 */
export const userDb = {
    getUser(address: string) {
        return db.prepare("SELECT * FROM users WHERE address = ?").get(address) as
            | {
                address: string;
                paid: number;
                current_day: number;
                joined_at: string;
                timezone: string;
            }
            | undefined;
    },

    createUser(address: string) {
        return db
            .prepare("INSERT INTO users (address) VALUES (?)")
            .run(address);
    },

    updateUser(address: string, updates: { paid?: boolean; current_day?: number }) {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.paid !== undefined) {
            fields.push("paid = ?");
            values.push(updates.paid ? 1 : 0);
        }
        if (updates.current_day !== undefined) {
            fields.push("current_day = ?");
            values.push(updates.current_day);
        }

        if (fields.length === 0) return;

        values.push(address);
        return db
            .prepare(`UPDATE users SET ${fields.join(", ")} WHERE address = ?`)
            .run(...values);
    },

    getAllPaidUsers() {
        return db.prepare("SELECT * FROM users WHERE paid = 1").all() as Array<{
            address: string;
            paid: number;
            current_day: number;
            joined_at: string;
            timezone: string;
        }>;
    },
};

/**
 * Answer submission operations
 */
export const answerDb = {
    recordAnswer(
        userAddress: string,
        day: number,
        answer: string,
        isCorrect: boolean,
        puzzleSentAt: Date | null,
        hintsUsed: number = 0
    ) {
        const submittedAt = new Date();
        const responseTimeMs = puzzleSentAt
            ? submittedAt.getTime() - puzzleSentAt.getTime()
            : null;

        return db
            .prepare(
                `INSERT OR REPLACE INTO answer_submissions 
        (user_address, day, answer, submitted_at, puzzle_sent_at, response_time_ms, is_correct, hints_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                userAddress,
                day,
                answer,
                submittedAt.toISOString(),
                puzzleSentAt?.toISOString() || null,
                responseTimeMs,
                isCorrect ? 1 : 0,
                hintsUsed
            );
    },

    getAnswer(userAddress: string, day: number) {
        return db
            .prepare(
                "SELECT * FROM answer_submissions WHERE user_address = ? AND day = ?"
            )
            .get(userAddress, day) as
            | {
                id: number;
                user_address: string;
                day: number;
                answer: string;
                submitted_at: string;
                puzzle_sent_at: string | null;
                response_time_ms: number | null;
                is_correct: number;
                hints_used: number;
            }
            | undefined;
    },

    getUserStats(userAddress: string) {
        return db
            .prepare(
                `SELECT 
          COUNT(*) as total_answers,
          SUM(is_correct) as correct_answers,
          AVG(CASE WHEN is_correct = 1 THEN response_time_ms END) as avg_response_time
        FROM answer_submissions 
        WHERE user_address = ?`
            )
            .get(userAddress) as {
                total_answers: number;
                correct_answers: number;
                avg_response_time: number | null;
            };
    },
};

/**
 * Puzzle operations
 */
export const puzzleDb = {
    getPuzzle(day: number) {
        return db.prepare("SELECT * FROM puzzles WHERE day = ?").get(day) as
            | {
                day: number;
                question: string;
                answer: string;
                hint1: string | null;
                hint2: string | null;
                hint3: string | null;
                category: string | null;
                difficulty: number;
            }
            | undefined;
    },

    insertPuzzle(
        day: number,
        question: string,
        answer: string,
        hints: [string, string, string],
        category?: string,
        difficulty: number = 1
    ) {
        return db
            .prepare(
                `INSERT OR REPLACE INTO puzzles (day, question, answer, hint1, hint2, hint3, category, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(day, question, answer, hints[0], hints[1], hints[2], category || null, difficulty);
    },

    getAllPuzzles() {
        return db.prepare("SELECT * FROM puzzles ORDER BY day").all() as Array<{
            day: number;
            question: string;
            answer: string;
            hint1: string | null;
            hint2: string | null;
            hint3: string | null;
            category: string | null;
            difficulty: number;
        }>;
    },
};

/**
 * Puzzle send tracking
 */
export const puzzleSendDb = {
    recordSend(userAddress: string, day: number) {
        return db
            .prepare(
                "INSERT OR REPLACE INTO puzzle_sends (user_address, day, sent_at) VALUES (?, ?, ?)"
            )
            .run(userAddress, day, new Date().toISOString());
    },

    getSendTime(userAddress: string, day: number): Date | null {
        const result = db
            .prepare("SELECT sent_at FROM puzzle_sends WHERE user_address = ? AND day = ?")
            .get(userAddress, day) as { sent_at: string } | undefined;

        return result ? new Date(result.sent_at) : null;
    },
};

/**
 * Transaction operations
 */
export const transactionDb = {
    recordTransaction(
        userAddress: string,
        day: number,
        amount: string,
        txHash?: string
    ) {
        return db
            .prepare(
                `INSERT INTO transactions (user_address, day, tx_hash, amount, status)
        VALUES (?, ?, ?, ?, ?)`
            )
            .run(userAddress, day, txHash || null, amount, txHash ? "completed" : "pending");
    },

    updateTransaction(id: number, txHash: string, status: string) {
        return db
            .prepare(
                `UPDATE transactions SET tx_hash = ?, status = ?, completed_at = ? WHERE id = ?`
            )
            .run(txHash, status, new Date().toISOString(), id);
    },

    getUserTransactions(userAddress: string) {
        return db
            .prepare("SELECT * FROM transactions WHERE user_address = ? ORDER BY created_at DESC")
            .all(userAddress) as Array<{
                id: number;
                user_address: string;
                day: number;
                tx_hash: string | null;
                amount: string;
                status: string;
                created_at: string;
                completed_at: string | null;
            }>;
    },
};

/**
 * Leaderboard operations
 */
export const leaderboardDb = {
    getTopUsers(limit: number = 10) {
        return db
            .prepare(
                `SELECT 
          u.address,
          COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as correct_answers,
          AVG(CASE WHEN a.is_correct = 1 THEN a.response_time_ms END) as avg_response_time,
          SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as streak
        FROM users u
        LEFT JOIN answer_submissions a ON u.address = a.user_address
        WHERE u.paid = 1
        GROUP BY u.address
        HAVING correct_answers > 0
        ORDER BY correct_answers DESC, avg_response_time ASC
        LIMIT ?`
            )
            .all(limit) as Array<{
                address: string;
                correct_answers: number;
                avg_response_time: number | null;
                streak: number;
            }>;
    },

    getUserRank(userAddress: string): number {
        const result = db
            .prepare(
                `WITH ranked_users AS (
          SELECT 
            u.address,
            COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as correct_answers,
            AVG(CASE WHEN a.is_correct = 1 THEN a.response_time_ms END) as avg_response_time,
            ROW_NUMBER() OVER (ORDER BY COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) DESC, AVG(CASE WHEN a.is_correct = 1 THEN a.response_time_ms END) ASC) as rank
          FROM users u
          LEFT JOIN answer_submissions a ON u.address = a.user_address
          WHERE u.paid = 1
          GROUP BY u.address
          HAVING correct_answers > 0
        )
        SELECT rank FROM ranked_users WHERE address = ?`
            )
            .get(userAddress) as { rank: number } | undefined;

        return result?.rank || 0;
    },
};

/**
 * Hint operations
 */
export const hintDb = {
    getHintsUsed(address: string, day: number): number {
        const stmt = db.prepare("SELECT hints_used FROM hint_usage WHERE user_address = ? AND day = ?");
        const result = stmt.get(address, day) as { hints_used: number } | undefined;
        return result ? result.hints_used : 0;
    },

    incrementHintsUsed(address: string, day: number) {
        const stmt = db.prepare(`
            INSERT INTO hint_usage (user_address, day, hints_used)
            VALUES (?, ?, 1)
            ON CONFLICT(user_address, day) DO UPDATE SET hints_used = hints_used + 1
        `);
        stmt.run(address, day);
        return this.getHintsUsed(address, day);
    }
};

// Initialize on import
initializeDatabase();

export default db;
