import Database from "better-sqlite3";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { User, Batch, BatchEvent } from "./models.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "agri_chain.db");

// ── State flags ──
let isMongo = false;
let sqliteDb = null;

// Helper to initialize SQLite
function initSqlite() {
  if (!sqliteDb) {
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma("journal_mode = WAL");
  }
  return sqliteDb;
}

// Check MongoDB connection if MONGODB_URI is provided
const mongoUri = process.env.MONGODB_URI;

if (mongoUri && mongoUri.trim() !== "") {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isMongo = true;
    console.log("Connected to MongoDB successfully!");
  } catch (err) {
    console.warn("MongoDB connection failed (" + err.message + "). Falling back to SQLite.");
    isMongo = false;
    initSqlite();
  }
} else {
  console.log("No MONGODB_URI provided. Using SQLite database (" + dbPath + ").");
  initSqlite();
}

export function isMongoConnected() {
  return isMongo && mongoose.connection.readyState === 1;
}

// ── Unified Pool Adapter ──
// Supports both MongoDB Mongoose models and SQLite queries seamlessly
export const pool = {
  async query(sql, params = []) {
    if (isMongoConnected()) {
      return executeMongoQuery(sql, params);
    }
    return executeSqliteQuery(sql, params);
  },
  async end() {
    if (isMongoConnected()) {
      await mongoose.disconnect();
    }
    if (sqliteDb) {
      sqliteDb.close();
    }
  },
};

// ── SQLite Query Executor ──
function executeSqliteQuery(sql, params = []) {
  const db = initSqlite();
  const normalizedSql = sql.replace(/\$\d+/g, () => "?");
  const trimmed = normalizedSql.trim().toUpperCase();
  const isSelect = trimmed.startsWith("SELECT");
  const isReturning = normalizedSql.toUpperCase().includes("RETURNING");

  if (isSelect) {
    const rows = db.prepare(normalizedSql).all(...params);
    return { rows, rowCount: rows.length };
  } else if (isReturning) {
    const withoutReturning = normalizedSql.replace(/\s+RETURNING\s+.*/i, "");
    db.prepare(withoutReturning).run(...params);

    if (trimmed.startsWith("INSERT")) {
      const table = normalizedSql.match(/INTO\s+(\w+)/i)?.[1];
      if (table && params[0]) {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
    }
    if (trimmed.startsWith("UPDATE")) {
      const table = normalizedSql.match(/UPDATE\s+(\w+)/i)?.[1];
      const whereMatch = withoutReturning.match(/WHERE\s+id\s*=\s*\?/i);
      if (table && whereMatch) {
        const id = params[params.length - 1];
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  } else {
    const result = db.prepare(normalizedSql).run(...params);
    return { rows: [], rowCount: result.changes };
  }
}

// ── MongoDB Query Executor (translates SQL calls into Mongoose operations) ──
async function executeMongoQuery(sql, params = []) {
  const cleanSql = sql.trim();
  const upper = cleanSql.toUpperCase();

  // 1. Users Queries
  if (upper.includes("FROM USERS") || upper.includes("INTO USERS")) {
    if (upper.startsWith("SELECT ID FROM USERS WHERE EMAIL =")) {
      const user = await User.findOne({ email: params[0].toLowerCase().trim() }).select("id").lean();
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (upper.startsWith("SELECT * FROM USERS WHERE EMAIL =")) {
      const user = await User.findOne({ email: params[0].toLowerCase().trim() }).lean();
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (upper.startsWith("SELECT ID, NAME, EMAIL, ROLE, CREATED_AT FROM USERS WHERE ID =")) {
      const user = await User.findOne({ id: params[0] }).select("id name email role created_at").lean();
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (upper.startsWith("INSERT INTO USERS")) {
      // params: [id, name, email, password_hash, role, created_at]
      const user = await User.create({
        id: params[0],
        name: params[1],
        email: params[2].toLowerCase().trim(),
        password_hash: params[3],
        role: params[4] || "Farmer",
        created_at: params[5] || new Date().toISOString(),
      });
      return { rows: [user.toObject()], rowCount: 1 };
    }
  }

  // 2. Batches Queries
  if (upper.includes("FROM BATCHES") || upper.includes("INTO BATCHES") || upper.includes("UPDATE BATCHES")) {
    if (upper.startsWith("INSERT INTO BATCHES")) {
      // params: [id, farmer, crop, quantity, location, created_at]
      const batch = await Batch.create({
        id: params[0],
        farmer: params[1],
        crop: params[2],
        quantity: Number(params[3]),
        location: params[4] || "",
        created_at: params[5] || new Date().toISOString(),
      });
      return { rows: [batch.toObject()], rowCount: 1 };
    }
    if (upper.startsWith("SELECT * FROM BATCHES ORDER BY CREATED_AT DESC")) {
      const batches = await Batch.find().sort({ created_at: -1 }).lean();
      return { rows: batches, rowCount: batches.length };
    }
    if (upper.startsWith("SELECT * FROM BATCHES WHERE ID")) {
      const batch = await Batch.findOne({ id: params[0] }).lean();
      return { rows: batch ? [batch] : [], rowCount: batch ? 1 : 0 };
    }
    if (upper.startsWith("SELECT STATUS FROM BATCHES WHERE ID")) {
      const batch = await Batch.findOne({ id: params[0] }).select("status").lean();
      return { rows: batch ? [batch] : [], rowCount: batch ? 1 : 0 };
    }
    if (upper.startsWith("UPDATE BATCHES SET HARVEST_SCORE=")) {
      const updated = await Batch.findOneAndUpdate(
        { id: params[1] },
        { harvest_score: params[0] },
        { new: true }
      ).lean();
      return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
    }
    if (upper.startsWith("UPDATE BATCHES SET DELIVERY_SCORE=")) {
      const updated = await Batch.findOneAndUpdate(
        { id: params[1] },
        { delivery_score: params[0] },
        { new: true }
      ).lean();
      return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
    }
    if (upper.includes("SET STATUS='QUALITY_CHECKED' WHERE ID=")) {
      const updated = await Batch.findOneAndUpdate(
        { id: params[0], status: "HARVESTED" },
        { status: "QUALITY_CHECKED" },
        { new: true }
      ).lean();
      return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
    }
    if (upper.startsWith("UPDATE BATCHES SET STATUS=$1 WHERE ID=$2")) {
      const updated = await Batch.findOneAndUpdate(
        { id: params[1] },
        { status: params[0] },
        { new: true }
      ).lean();
      return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
    }
    if (upper.includes("SET STATUS='SETTLED' WHERE ID=")) {
      const updated = await Batch.findOneAndUpdate(
        { id: params[0] },
        { status: "SETTLED" },
        { new: true }
      ).lean();
      return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
    }
  }

  // 3. Batch Events Queries
  if (upper.includes("BATCH_EVENTS")) {
    if (upper.startsWith("INSERT INTO BATCH_EVENTS")) {
      // params: [batch_id, status, description, created_at]
      const event = await BatchEvent.create({
        batch_id: params[0],
        status: params[1],
        description: params[2] || "",
        created_at: params[3] || new Date().toISOString(),
      });
      return { rows: [event.toObject()], rowCount: 1 };
    }
    if (upper.startsWith("SELECT * FROM BATCH_EVENTS WHERE BATCH_ID")) {
      const events = await BatchEvent.find({ batch_id: params[0] }).sort({ created_at: 1 }).lean();
      return { rows: events, rowCount: events.length };
    }
  }

  console.warn("Unmapped MongoDB query fallback:", cleanSql);
  return { rows: [], rowCount: 0 };
}

export { User, Batch, BatchEvent, mongoose };
export default initSqlite();
