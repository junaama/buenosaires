# Advent Calendar Agent

An agent built on **XMTP** for messaging and **Coinbase Developer Platform (CDP)** for blockchain interactions. Users solve puzzles and choose to be naughty or nice.

## Features

- **Daily Puzzles**: Delivers a new puzzle every day.
- **Crypto Rewards**: Users earn USDC for correct answers.
- **Naughty or Nice**: A gamified reward choice:
  - **Nice**: Safe, guaranteed USDC reward.
  - **Naughty**: Risky swap for a random top Base memecoin (with 2x bonus if you already hold it!).
- **Onramp Integration**: Helps new users buy USDC directly via Coinbase Onramp.
- **Leaderboard**: Tracks top solvers and fastest times.

## We used

### **XMTP Agent SDK** (`@xmtp/agent-sdk`)
- **Messaging**: Handles all user interactions via the XMTP network.
- **State Management**: Manages conversation context and user sessions.
- **Payment Detection**: Listens for payment transaction references to unlock the calendar.

### **Coinbase Developer Platform (CDP)** (`@coinbase/agentkit`)
- **Wallet Management**: Creates and manages the agent's MPC wallet.
- **USDC Transfers**: Executes "Nice" rewards.
- **Trade API**: Performs token swaps for "Naughty" rewards.
- **Onramp**: Generates personalized buy links for user wallet funding.
- **Data API**: Checks user balances for bonus multipliers.

## Setup Guide

### Prerequisites
- Node.js v20+
- A Coinbase Developer Platform (CDP) API Key, Wallet key
- An XMTP private key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd advent-agent-standalone
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Configure Environment**
   Create a `.env` file based on `.env.example`:

   ```bash
   # CDP Configuration (Required for Wallet & Swaps)
   CDP_API_KEY_NAME="your-key-name"
   CDP_API_KEY_PRIVATE_KEY="your-private-key"
   CDP_PROJECT_ID="your-project-id" # Required for Onramp
   
   # Network Configuration
   NETWORK_ID="base-sepolia" # or "base-mainnet"
   
   # XMTP Configuration
   XMTP_KEY="0x..." # Optional: Persist agent identity
   XMTP_ENV="production"
   ```

4. **Seed the Database**
   Initialize the puzzles database:
   ```bash
   yarn run seed
   ```

5. **Fund the Agent**
   Run the wallet script to get the agent's address:
   ```bash
   yarn run wallet
   ```
   Send some ETH (for gas) and USDC (for rewards) to this address on Base Sepolia.

### Running the Agent

```bash
yarn run dev
```
The agent will start and print its link. Message it on an XMTP app to start!

## Architecture

### 1. User Onboarding (XMTP + CDP Onramp)
- User messages the agent.
- Agent checks if user has paid the entry fee.
- **If not paid**: Agent requests payment.
- **If no funds**: Agent generates a **Coinbase Onramp** link so the user can buy USDC with fiat.

### 2. Puzzle Loop (XMTP)
- Agent sends the daily puzzle.
- User replies with an answer.
- Agent validates the answer 

### 3. Reward Distribution (CDP AgentKit)
- **Nice Path**: Agent sends USDC.
- **Naughty Path**:
  1. Agent fetches top Base tokens via CoinGecko.
  2. Agent checks user's balance.
  3. Agent uses `CdpEvmWalletActionProvider.swap` to execute the token swap on-chain.

