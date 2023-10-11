require("dotenv").config();
import { Request, Response, NextFunction } from "express"
import { catchAsyncError } from "./catchAsyncErrors"
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { JwtPayload } from "jsonwebtoken";
import { redis } from "../utils/redis";


// authenticated user
export const isAuthenticated = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const access_token = req.cookies.access_token;
    if (!access_token) {
      return next(new ErrorHandler("Please login to access this resource", 400));
    }

    const decoded = jwt.verify(
      access_token,
      process.env.ACCESS_TOKEN as string
    ) as JwtPayload;

    if (!decoded) {
      return next(new ErrorHandler("Invalid access token", 400));
    }

    const user = await redis.get(decoded.id);

    if (!user) {
      return next(new ErrorHandler("User not found", 400));
    }

    // req.user would give error, but it is not, because of custom.d.ts file in @types folder
    req.user = JSON.parse(user);
    next();

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 400));
  }
})


// validate user role
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role)) {
      return next(new ErrorHandler(`Role ${req.user?.role} is not allowed to access this resource`, 403));
    }

    next();
  }
}