import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

export const config = {
  // API Keys
  newsApiKey: process.env.NEWSAPI_KEY || "",
  alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || "",

  // Trading parameters
  riskFreeRate: parseFloat(process.env.RISK_FREE_RATE || "0.065"),
  initialCashBalance: 1000000, // ₹10 Lakh

  // Cache TTLs (in seconds)
  cacheTTL: {
     livePrice: 300,     // 30s → 5 minutes
  ohlc: 900,          // 5min → 15 minutes
  optionsChain: 180,  // 1min → 3 minutes
  newsSentiment: 3600, // 30min → 1 hour
  },

  // Market hours (IST)
  marketHours: {
    start: { hour: 9, minute: 15 },
    end: { hour: 15, minute: 30 },
    timezone: "Asia/Kolkata",
  },

  // Indian market indices
  indices: {
    NIFTY: "^NSEI",
    NIFTY50: "^NSEI",
    BANKNIFTY: "^NSEBANK",
    NIFTYIT: "^CNXIT",
    NIFTYBANK: "^NSEBANK",
    NIFTYPHARMA: "^CNXPHARMA",
    NIFTYAUTO: "^CNXAUTO",
    NIFTYFMCG: "^CNXFMCG",
    NIFTYMETAL: "^CNXMETAL",
    NIFTYREALTY: "^CNXREALTY",
    NIFTYENERGY: "^CNXENERGY",
  },

  // Sector indices for heatmap
  sectorIndices: [
    { name: "NIFTY IT", symbol: "^CNXIT" },
    { name: "NIFTY BANK", symbol: "^NSEBANK" },
    { name: "NIFTY PHARMA", symbol: "^CNXPHARMA" },
    { name: "NIFTY AUTO", symbol: "^CNXAUTO" },
    { name: "NIFTY FMCG", symbol: "^CNXFMCG" },
    { name: "NIFTY METAL", symbol: "^CNXMETAL" },
    { name: "NIFTY REALTY", symbol: "^CNXREALTY" },
    { name: "NIFTY ENERGY", symbol: "^CNXENERGY" },
  ],

  // Nifty 50 constituents (sample - extend as needed)
  nifty50Stocks: [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "INFY",
    "ICICIBANK",
    "HINDUNILVR",
    "ITC",
    "SBIN",
    "BHARTIARTL",
    "BAJFINANCE",
    "KOTAKBANK",
    "LT",
    "ASIANPAINT",
    "AXISBANK",
    "MARUTI",
    "HCLTECH",
    "WIPRO",
    "SUNPHARMA",
    "TITAN",
    "ULTRACEMCO",
    "NESTLEIND",
    "TATASTEEL",
    "BAJAJFINSV",
    "POWERGRID",
    "NTPC",
    "M&M",
    "TECHM",
    "ONGC",
    "TATAMOTORS",
    "ADANIPORTS",
    "COALINDIA",
    "INDUSINDBK",
    "DRREDDY",
    "GRASIM",
    "JSWSTEEL",
    "HINDALCO",
    "BPCL",
    "EICHERMOT",
    "DIVISLAB",
    "CIPLA",
    "HEROMOTOCO",
    "SBILIFE",
    "BAJAJ-AUTO",
    "TATACONSUM",
    "BRITANNIA",
    "APOLLOHOSP",
    "ADANIENT",
    "HDFCLIFE",
    "LTIM",
    "SHRIRAMFIN",
  ],

  // Database path
  dbPath: join(__dirname, "..", "data", "portfolio.db"),
};

// Sentiment keywords
export const sentimentKeywords = {
  bullish: [
    "rally",
    "surge",
    "gain",
    "rise",
    "up",
    "high",
    "growth",
    "profit",
    "positive",
    "bullish",
    "strong",
    "outperform",
    "buy",
    "upgrade",
    "beat",
    "exceed",
    "record",
    "milestone",
    "expansion",
    "breakthrough",
  ],
  bearish: [
    "fall",
    "drop",
    "decline",
    "crash",
    "plunge",
    "down",
    "loss",
    "negative",
    "bearish",
    "weak",
    "underperform",
    "sell",
    "downgrade",
    "miss",
    "concern",
    "risk",
    "warning",
    "cut",
    "layoff",
    "investigation",
  ],
};
