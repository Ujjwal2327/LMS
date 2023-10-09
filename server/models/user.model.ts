/*
Model Creation Steps
  define the user INTERFACE (defining "type" of each property / method in a model) at the top
    this is optional but it is best practice in typescript
  define SCHEMA for IUser model (only properties, not defining methods)
  define User MODEL
  some functionalities before saving it in database
  define Model methods
*/


import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from 'bcryptjs'

// regular expression for validating email
const emailRegexPattern: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// define the user INTERFACE
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar: {
    public_id: string;
    url: string;
  };
  role: string;
  isVerified: boolean;
  courses: Array<{ courseId: string }>;
  comparePassword: (password: string) => Promise<boolean>;    // method
}


// define SCHEMA for IUser model
const userSchema: Schema<IUser> = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
    },
    email: {
      type: String,
      required: [true, "Please enter your email"],
      validate: {
        validator: function (val: string) {
          return emailRegexPattern.test(val);
          // JS & TS expression used to test a regular expression pattern against a given value
          // returns true or false
        },
        message: "Please enter a valid email",
      },
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please enter your password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,    // to hide password field from query results by default when fetching data from database
    },
    avatar: {
      public_id: String,
      url: String,
    },
    role: {
      type: String,
      default: "User",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    courses: [{ courseId: String }],
  },
  { timestamps: true }
)


// hash password before saving in database
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});


// define comparePassword method
userSchema.methods.comparePassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};


// define user MODEL
const userModel: Model<IUser> = mongoose.model("User", userSchema);
export default userModel;