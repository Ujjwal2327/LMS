/*
Model Creation Steps
  define the user INTERFACE (defining "type" of each property / method in a model) at the top
    this is optional but it is best practice in typescript
  define SCHEMA for IUser model (only properties, not defining methods)
  define User MODEL
  some functionalities before saving it in database
  define Model methods

Access_Token And Refresh_Token For High Level Security
  all protected routes will be accessed by sending cookies with request api call
  cookies will contain access_token and refresh_token
  access_token will expire after 5 mins, but refresh_token remains for very long time
  we can again get acces_token by the use of refresh_token
  in api call request, if access_token in cookies is expired,
    then it will do another request to get access token by the help of refresh_token
    then after getting access_token, it will go to protected route
  in api call request, if access_token is not expired in cookies,
    then directly go to protected route
  
*/


require("dotenv").config();
import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from 'bcryptjs'
import jwt, { Secret } from "jsonwebtoken";

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
  signAccessToken: () => string;
  signRefreshToken: () => string;
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


// define model methods
// define comparePassword method
userSchema.methods.comparePassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// define signAccessToken method
userSchema.methods.signAccessToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.ACCESS_TOKEN || ""
    // process.env.ACCESS_TOKEN as Secret
  );
}

// define signRefreshToken method
userSchema.methods.signRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.REFRESH_TOKEN || ""
    // process.env.REFRESH_TOKEN as Secret
  );
}


// define user MODEL
const userModel: Model<IUser> = mongoose.model("User", userSchema);
export default userModel;