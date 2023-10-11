require('dotenv').config();
import userModel, { IUser } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { catchAsyncError } from "../middleware/catchAsyncErrors";
import { NextFunction, Request, Response } from "express";
import jwt, { Secret } from "jsonwebtoken"
import ejs from "ejs"
import path from "path";
import sendMail from "../utils/sendMail";
import { sendToken } from "../utils/jwt";
import { redis } from "../utils/redis";

// register user
interface IRegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {
    const { name, email, password } = req.body;

    const isEmailExist = await userModel.findOne({ email });

    if (isEmailExist) {
      return next(new ErrorHandler("Email already exists", 400));
    }

    const user: IRegistrationBody = { name, email, password };

    const activationToken = createActivationToken(user);

    const activationCode = activationToken.activationCode;

    const data = {
      user: { name: user.name },    // these are simple obj and its props, not TS type format
      activationCode
    };

    // // render HTML string into a constant named "html"
    // const html = await ejs.renderFile(path.join(__dirname, "../mails/activation-mail.ejs"), data);

    try {
      await sendMail({
        email: user.email,
        subject: "Activate your account",
        template: "activation-mail.ejs",
        data,
      });

      res.status(201)
        .json({
          success: true,
          message: `Please check your email ${user.email} to activate your account!`,
          activationToken: activationToken.token,
        })
    }
    catch (err: any) {
      return new ErrorHandler(err.message, 400);
    }

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400))
  }

})


// function to get activation code
interface IActivationToken {
  token: string;
  activationCode: string;
}

export const createActivationToken = (user: any): IActivationToken => {
  // random 4 digit activation code
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    { user, activationCode },
    process.env.ACTIVATION_SECRET as Secret,
    { expiresIn: "5m" }
  );

  return { token, activationCode }
}


// activate user using activation code after registration and save it to database
interface IActivationRequest {
  activation_token: string;
  activation_code: string;
}

export const activateUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const { activation_token, activation_code } = req.body as IActivationRequest;

    const newUser: { user: IUser; activationCode: string } = jwt.verify(
      activation_token,
      process.env.ACTIVATION_SECRET as string
    ) as { user: IUser; activationCode: string };

    if (newUser.activationCode !== activation_code) {
      return next(new ErrorHandler("Invalid activation code", 400));
    }

    const { name, email, password } = newUser.user;

    const existsUser = await userModel.findOne({ email });

    if (existsUser) {
      return next(new ErrorHandler("Email already exists", 400));
    }

    const user = await userModel.create({ name, email, password });

    res.status(201).json({ success: true });
  }

  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }

})


// login user
interface ILoginRequest {
  email: string;
  password: string;
}

export const loginUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { email, password } = req.body as ILoginRequest;

    if (!email || !password) {
      return next(new ErrorHandler("Please enter email and password", 400));
    }

    const user = await userModel.findOne({ email }).select("+password");
    // to get password alongwith all other details in user object in database

    if (!user) {
      return next(new ErrorHandler("Email doesnot exists", 400));
    }

    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return next(new ErrorHandler("Invalid password", 400));
    }

    sendToken(user, 200, res);

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})


// logout user
export const logoutUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    res.cookie("access_token", "", { maxAge: 1 });
    res.cookie("refresh_token", "", { maxAge: 1 });

    // user in req.user is coming from auth.js - req.user = JSON.parse(user);
    const userId = req.user._id || "";
    redis.del(userId);

    res.status(200)
      .json({
        success: true,
        message: "User Logged Out Successfully"
      })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})


