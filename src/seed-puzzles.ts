import { puzzleDb } from "./database.js";

/**
 * Seed the database with 12 advent calendar puzzles
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
                question: "What is the capital of France?",
                answer: "Paris",
                hints: [
                    "It's known as the City of Light",
                    "The Eiffel Tower is located here",
                    "It starts with 'P' and has 5 letters",
                ],
                category: "Geography",
                difficulty: 1,
            },
            {
                day: 2,
                question: "What is the largest planet in our solar system?",
                answer: "Jupiter",
                hints: [
                    "It's a gas giant",
                    "It has a Great Red Spot",
                    "Named after the king of Roman gods",
                ],
                category: "Astronomy",
                difficulty: 1,
            },
            {
                day: 3,
                question: "What is the chemical symbol for gold?",
                answer: "Au",
                hints: [
                    "It comes from the Latin word 'aurum'",
                    "It's a two-letter symbol",
                    "The first letter is 'A'",
                ],
                category: "Chemistry",
                difficulty: 2,
            },
            {
                day: 4,
                question: "What is the smallest country in the world?",
                answer: "Vatican City",
                hints: [
                    "It's located within another country",
                    "The Pope lives here",
                    "It's in Rome, Italy",
                ],
                category: "Geography",
                difficulty: 2,
            },
            {
                day: 5,
                question: "What is the currency of Japan?",
                answer: "Yen",
                hints: [
                    "It's one of the major currencies in forex trading",
                    "The symbol is ¥",
                    "It's a 3-letter word starting with 'Y'",
                ],
                category: "Economics",
                difficulty: 1,
            },
            {
                day: 6,
                question: "What is the largest desert in the world?",
                answer: "Sahara",
                hints: [
                    "It's in Africa",
                    "It's a hot desert",
                    "The name means 'desert' in Arabic",
                ],
                category: "Geography",
                difficulty: 2,
            },
            {
                day: 7,
                question: "What is the chemical formula for water?",
                answer: "H2O",
                hints: [
                    "It contains hydrogen and oxygen",
                    "Two atoms of one element, one of another",
                    "It's written as H followed by a number and O",
                ],
                category: "Chemistry",
                difficulty: 1,
            },
            {
                day: 8,
                question: "What is the smallest planet in our solar system?",
                answer: "Mercury",
                hints: [
                    "It's closest to the Sun",
                    "Named after the Roman messenger god",
                    "It's smaller than Earth's moon",
                ],
                category: "Astronomy",
                difficulty: 2,
            },
            {
                day: 9,
                question: "What is the chemical symbol for carbon?",
                answer: "C",
                hints: [
                    "It's the basis of organic chemistry",
                    "It's a single letter",
                    "Diamond and graphite are made of this element",
                ],
                category: "Chemistry",
                difficulty: 1,
            },
            {
                day: 10,
                question: "What is the largest country in the world by area?",
                answer: "Russia",
                hints: [
                    "It spans two continents",
                    "It has 11 time zones",
                    "Its capital is Moscow",
                ],
                category: "Geography",
                difficulty: 1,
            },
            {
                day: 11,
                question: "What is the chemical symbol for oxygen?",
                answer: "O",
                hints: [
                    "It makes up about 21% of Earth's atmosphere",
                    "It's a single letter",
                    "Essential for human respiration",
                ],
                category: "Chemistry",
                difficulty: 1,
            },
            {
                day: 12,
                question: "What is the driest desert in the world?",
                answer: "Atacama",
                hints: [
                    "It's in South America",
                    "Located in Chile",
                    "Some areas haven't seen rain in over 400 years",
                ],
                category: "Geography",
                difficulty: 3,
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
            console.log(`✅ Seeded puzzle for Day ${puzzle.day}`);
        } catch (error) {
            console.log(`ℹ️  Puzzle for Day ${puzzle.day} already exists`);
        }
    }

    console.log("✅ All puzzles seeded");
}
