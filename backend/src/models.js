import mongoose from "mongoose";

// ── User Schema ──
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ["Farmer", "Distributor", "Retailer", "Inspector"], default: "Farmer" },
  created_at: { type: String, default: () => new Date().toISOString() },
});

// ── Batch Schema ──
const BatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  farmer: { type: String, required: true },
  crop: { type: String, required: true },
  quantity: { type: Number, required: true },
  location: { type: String, default: "" },
  status: { 
    type: String, 
    enum: ["HARVESTED", "QUALITY_CHECKED", "IN_TRANSIT", "DELIVERED", "SETTLED"], 
    default: "HARVESTED" 
  },
  harvest_score: { type: Number, default: null },
  delivery_score: { type: Number, default: null },
  user_id: { type: String, default: null },
  created_at: { type: String, default: () => new Date().toISOString() },
});

// ── Batch Timeline Event Schema ──
const BatchEventSchema = new mongoose.Schema({
  batch_id: { type: String, required: true, index: true },
  status: { type: String, required: true },
  description: { type: String, default: "" },
  created_at: { type: String, default: () => new Date().toISOString() },
});

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
export const Batch = mongoose.models.Batch || mongoose.model("Batch", BatchSchema);
export const BatchEvent = mongoose.models.BatchEvent || mongoose.model("BatchEvent", BatchEventSchema);
