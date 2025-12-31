# DEGIRO Portfolio Tracker - Overview

A friendly guide to understanding your investment portfolio.

---

## What Is This App?

The DEGIRO Portfolio Tracker is a **personal finance dashboard** that helps you understand how your investments are performing. If you have a DEGIRO brokerage account, this app takes the data from your account and turns it into easy-to-understand charts and summaries.

Think of it as a **health checkup for your investments** - it shows you how much money you've made (or lost), where your money is invested, and how your portfolio compares to the overall market.

---

## What Can You See?

### 📊 Portfolio Performance Chart

A line chart showing how your investments have performed over time.

**Three Lines Displayed:**
1. **Your Portfolio** (blue) - Your actual investment value
2. **S&P 500** (green) - A benchmark representing the 500 largest US companies
3. **MSCI World** (orange) - A benchmark representing stocks from 23 developed countries

#### Why Do They All Start From the Same Point?

The chart uses **"Matched Investment" methodology** - a fair way to compare your portfolio against benchmarks:

> **The Question Being Answered:** "What if I had put the same money into the S&P 500 instead of my chosen stocks?"

**How It Works:**
- When you deposit €1,000 into DEGIRO, the chart simulates also "buying" €1,000 worth of S&P 500 on that same day
- When you deposit another €500 three months later, it simulates buying €500 more of S&P 500 at *that day's price*
- This continues for every deposit you make

**This is important because:**
- Simply comparing "my portfolio vs S&P 500 price" would be unfair
- You didn't invest all your money on day 1 - you invested over time
- The matched investment accounts for your actual deposit timing

**Reading the Chart:**
| Scenario | What It Means |
|----------|---------------|
| Your line **above** benchmarks | You're outperforming the market 🎉 |
| Your line **below** benchmarks | The market is beating your picks |
| Lines close together | Your performance is similar to the market |

#### The "Show Deposits" Toggle

When enabled, you'll see a fourth line showing your **total invested amount** (the sum of all your deposits). This helps you see:
- Your portfolio value vs. what you actually put in
- Whether you're in profit (portfolio > deposits) or loss (portfolio < deposits)

### 🌟 North Star Metrics (The Hero Section)

The top of your dashboard features the most critical numbers:

1.  **Net Portfolio Value**: The current total market value (Cash + Investments).
    *   *Subtitle*: **Cost Basis** (Total amount you invested to acquire these assets).
2.  **Unrealized P&L**: The paper profit/loss on your current holdings (`Value - Cost Basis`).
3.  **Skill Score (TWR)**: Time-Weighted Return. This measures your investment performance *independent* of deposit timing.

### 💰 Secondary Metrics

Below the hero section, you'll find operational details:

| Metric | What It Means |
|--------|---------------|
| **Operational Gain/Loss** | Realized P&L from trades + Dividends (toggleable). |
| **Cash Balance** | Money currently sitting in your account availability. |
| **Dividends** | Total dividends collected in the selected period. |

### 🥧 Where Is Your Money?

**Pie charts** show you how your money is distributed across:

- **Asset Classes** - Stocks, ETFs, Crypto, Bonds, etc.
- **Sectors** - Technology, Healthcare, Energy, Finance, etc.
- **Geography** - USA, Europe, Emerging Markets, etc.

This helps you understand if you're too concentrated in one area (like all tech stocks) or well-diversified.

### 💵 Operations (Trading History)

A dedicated tab showing your chronological trading activity:

- **Volume Chart**: Visual comparison of Buy vs Sell volume for the period.
- **Activity Summary**: Total Buy Volume, Sell Volume, and Fees.
- **Fee Breakdown**: Explicit split between **Tx** (Transaction Fees) and **FX** (Currency Conversion Fees).
- **Detailed List**: Every trade with Price, Quantity, and Fees.

### 📈 Your Holdings

A detailed table of everything you own, showing:
- What you bought
- How many shares
- Current price
- How much it's worth
- Profit or loss on each position

### 📋 Income & Costs

A separate breakdown of account-level cash flows:
- **Dividends**: Detailed list with Ex-Dates and Payment Dates.
- **Account Fees**: Explicit charges like Connection Fees.

---

## Key Terms Explained

| Term | Simple Explanation |
|------|-------------------|
| **Portfolio** | Your collection of investments |
| **ETF** | A basket of stocks bundled together (like buying a variety pack instead of individual items) |
| **Dividend** | Money a company pays you just for owning their stock |
| **P/L (Profit/Loss)** | The difference between what you paid and what it's worth now |
| **Unrealized** | Paper gains/losses - you haven't sold yet |
| **Realized** | Actual gains/losses - you sold and locked in the result |
| **Benchmark** | A reference point (S&P 500) to compare your performance |
| **ISIN** | A unique code that identifies each stock/ETF (like a product barcode) |
| **Historical Rate** | The exchange rate on a specific past date (used for dividend conversion) |

---

## How Does It Work?

1. **Export your data** from DEGIRO (3 CSV files)
2. **Upload the files** to the app
3. **View your dashboard** with all the insights

The app runs entirely on your computer - your financial data never leaves your machine.

---

## Who Is This For?

- **Beginner investors** who want to understand their portfolio better
- **DEGIRO users** looking for better analytics than the platform provides
- **Anyone** who wants to track their investment performance over time

---

## What You'll Learn

After using this app, you'll be able to answer:

- ✅ Am I making money on my investments?
- ✅ How do I compare to the overall market?
- ✅ Is my portfolio diversified or too risky?
- ✅ How much have I received in dividends?
- ✅ How much am I paying in fees?

---

> 💡 **Tip**: The best investors check their portfolio regularly but don't panic over short-term fluctuations. Use this dashboard to understand trends, not to obsess over daily changes!
