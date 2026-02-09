import mongoose, { Schema, model } from "mongoose";

export type MongoConfig = {
  uri: string;
};

export const connectMongo = async (config: MongoConfig): Promise<void> => {
  await mongoose.connect(config.uri);
};

export type UserDocument = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  createdAt: Date;
};

const UserSchema = new Schema<UserDocument>(
  {
    _id: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, required: true }
  },
  { versionKey: false }
);

export const UserModel = model<UserDocument>("User", UserSchema);
