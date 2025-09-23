// server/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
const { Schema } = mongoose;

const UserSchema = new Schema({
  email: { type: String, unique: true, lowercase: true, trim: true, required: true },
  name: { type: String, trim: true },

  passwordHash: { type: String },
productionIds: [{ type: Schema.Types.ObjectId, ref: 'Production', index: true }],

  // password reset
  resetTokenHash: { type: String },
  resetExpiresAt: { type: Date },

  // invite (if you use it)
  inviteTokenHash: { type: String },
  inviteExpiresAt: { type: Date },
}, { timestamps: true });

UserSchema.methods.setPassword = async function(pw) {
  this.passwordHash = await bcrypt.hash(pw, 10);
};

export default mongoose.model('User', UserSchema);

