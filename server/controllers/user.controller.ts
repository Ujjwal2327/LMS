require('dotenv').config();
import userModel, { IUser } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { catchAsyncError } from "../middleware/catchAsyncErrors";
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, Secret } from "jsonwebtoken"
import ejs from "ejs"
import path from "path";
import sendMail from "../utils/sendMail";
import { accessTokenOptions, refreshTokenOptions, sendToken } from "../utils/jwt";
import { redis } from "../utils/redis";
import { getUserById } from "../services/user.service";
import cloudinary from "cloudinary"


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
    const userId = req.user?._id || "";
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


// update access token
export const updateAccessToken = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const refresh_token = req.cookies.refresh_token as string;
    const decoded = jwt.verify(
      refresh_token,
      process.env.REFRESH_TOKEN as string
    ) as JwtPayload;

    if (!decoded) {
      return next(new ErrorHandler("Invalid refresh token", 400));
    }

    const session = await redis.get(decoded.id as string);

    if (!session) {
      return next(new ErrorHandler("User Session expired", 400));
    }

    const user = JSON.parse(session);

    const accessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: "5m" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN as string,
      { expiresIn: "3d" }
    );

    req.user = user;

    res.cookie("access_token", accessToken, accessTokenOptions)
    res.cookie("refresh_token", refreshToken, refreshTokenOptions)

    res.status(200)
      .json({
        success: true,
        accessToken,
      })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})


// get user info
export const getUserInfo = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || "";
    getUserById(userId, res);

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})


// social authentication - ex - google authentication
interface ISocialAuthRequest {
  name: string;
  email: string;
  avatar: string;
}

export const socialAuth = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {
    const { name, email, avatar } = req.body as ISocialAuthRequest;
    const user = await userModel.findOne({ email });

    if (!user) {
      const newUser = await userModel.create({ name, email, avatar });
      sendToken(newUser, 200, res);
    }
    else {
      sendToken(user, 200, res);
    }
  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }

})


// update user info
interface IUpdateUserInfo {
  name: string;
  email: string;
}

export const updateUserInfo = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const { name, email } = req.body as IUpdateUserInfo;
    const userId = req.user?._id || "";
    const user = await userModel.findById(userId);

    if (email && user) {
      const isEmailExist = await userModel.findOne({ email });

      if (isEmailExist) {
        console.log(isEmailExist);
        return next(new ErrorHandler("Email already exists", 400));
      }
      user.email = email;
    }

    if (name && user) {
      user.name = name;
    }
    // user.name = name || user.name;

    await user?.save();   // new configurations of user is saved in database
    await redis.set(userId, JSON.stringify(user));

    res.status(201).json({ success: true, user });

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }

})


// update user password
interface IUpdateUserPassword {
  oldPassword: string;
  newPassword: string;
}

export const updateUserPassword = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body as IUpdateUserPassword;

    if (!oldPassword || !newPassword) {
      return next(new ErrorHandler("Please enter old and new password", 400));
    }

    const user = await userModel.findById(req.user?._id).select("+password");

    if (user?.password === undefined) {
      return next(new ErrorHandler("Invalid User", 400));
    }

    const isPasswordMatch = await user.comparePassword(oldPassword);

    if (!isPasswordMatch) {
      return next(new ErrorHandler("Invalid old password", 400));
    }

    user.password = newPassword;

    await user.save();
    await redis.set(user._id, JSON.stringify(user));

    res.status(201).json({
      success: true,
      user
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400))
  }
})


// update profile picture
interface IUpdateProfilePicture {
  // avatar: {
  //   url: string;         // will recieve from frontend
  //   public_id: string;   // will not recieve from frontend
  // }
  avatar: string;   // can only be base 64 string
}

export const updateProfilePicture = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { avatar } = req.body;

    const userId = req.user._id;

    const user = await userModel.findById(userId);

    if (avatar && user) {

      // if public_id already exists, that means user already has a profile picture uploaded on cloudinary, so we have to delete that image from cloudinary first, and then we will upload new image
      if (user?.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }

      const myCloud = await cloudinary.v2.uploader.upload(
        avatar,
        { folder: "avatars", width: 150 },
      );

      console.log(myCloud);

      user.avatar = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      }

      await user.save();
      await redis.set(userId, JSON.stringify(user));
    }

    res.status(201).json({
      success: true,
      user
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})