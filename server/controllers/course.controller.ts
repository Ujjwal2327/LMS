import ErrorHandler from "../utils/ErrorHandler";
import { catchAsyncError } from "../middleware/catchAsyncErrors";
import { Request, Response, NextFunction } from "express";
import cloudinary from "cloudinary";
import { createCourse } from "../services/course.service";
import courseModel, { IComment } from "../models/course.model";
import { redis } from "../utils/redis";
import mongoose from "mongoose";
import path from "path";
import ejs from "ejs";
import sendMail from "../utils/sendMail";


// upload course
export const uploadCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const data = req.body;

    const thumbnail = data.thumbnail;

    if (thumbnail) {
      const myCloud = await cloudinary.v2.uploader.upload(
        thumbnail,
        { folder: "courses" },
      )

      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url
      }
    }

    createCourse(data, res, next);

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }
})


// edit course
export const editCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const data = req.body;
    const thumbnail = data.thumbnail;

    if (thumbnail) {
      await cloudinary.v2.uploader.destroy(thumbnail.public_id);
      const myCloud = await cloudinary.v2.uploader.upload(
        thumbnail,
        { folder: "courses" },
      )

      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url
      }

    }
    const courseId = req.params.id;

    const course = await courseModel.findByIdAndUpdate(
      courseId,
      { $set: data },
      { new: true }
    )

    res.status(201).json({
      success: true,
      course,
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }

})


// get single course - without purchasing
export const getSingleCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const courseId = req.params.id;

    const isCacheExists = await redis.get(courseId);

    if (isCacheExists) {
      const course = JSON.parse(isCacheExists);

      return res.status(200).json({
        success: true,
        course,
      })
    }
    else {
      const course = await courseModel.findById(courseId)
        .select("-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links");

      await redis.set(courseId, JSON.stringify(course));

      res.status(200).json({
        success: true,
        course,
      })
    }

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }

})


// get all courses - without purchasing
export const getAllCourses = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const isCacheExists = await redis.get("allCourses");

    if (isCacheExists) {
      const courses = JSON.parse(isCacheExists);

      return res.status(200).json({
        success: true,
        courses
      })
    }
    else {
      const courses = await courseModel.find()
        .select("-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links");

      await redis.set("allCourses", JSON.stringify(courses));

      res.status(200).json({
        success: true,
        courses
      })
    }

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }

})


// get course content - only for valid user
export const getCourseByUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const userCourseList = req.user?.courses;

    const courseId = req.params.id;

    // const courseExists = userCourseList?.find((course) => course._id.toString() === courseId);
    const courseExists = userCourseList?.find((course) => course._id === courseId);

    console.log(userCourseList)

    if (!courseExists) {
      return next(new ErrorHandler("You are not authorized to access this course", 403))
    }

    const course = await courseModel.findById(courseId);
    const content = course?.courseData;

    res.status(200).json({
      success: true,
      content
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }

})


// add question in course
interface IAddQuestionData {
  question: string;
  courseId: string;
  contentId: string;
}

export const addQuestion = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {

  try {

    const { question, courseId, contentId }: IAddQuestionData = req.body;

    const course = await courseModel.findById(courseId);

    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return next(new ErrorHandler("Invalid contentId", 400))
    }

    const courseContent = course?.courseData.find((content) => content._id.equals(contentId));

    if (!courseContent) {
      return next(new ErrorHandler("Invalid contentId", 400))
    }

    // create new question object to add in database
    const newQuestion: any = {
      user: req.user,
      question,
      questionReplies: [],
    };

    courseContent.questions.push(newQuestion);

    await course?.save();

    res.status(200).json({
      success: true,
      course
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500))
  }

})


// add answer in course question
interface IAddAnswerData {
  answer: string;
  courseId: string;
  contentId: string;
  questionId: string;
}

export const addAnswer = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { answer, courseId, contentId, questionId }: IAddAnswerData = req.body;

    const course = await courseModel.findById(courseId);

    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return next(new ErrorHandler("Invalid contentId", 400))
    }

    const courseContent = course?.courseData.find(item => item._id.toString() === contentId);

    if (!courseContent) {
      return next(new ErrorHandler("Invalid contentId", 400));
    }

    const question = courseContent?.questions?.find(ques => ques._id.equals(questionId));

    if (!question) {
      return next(new ErrorHandler("Invalid questionId", 400));
    }

    // create new answer object
    const newAnswer: any = {
      user: req.user,
      answer,
    };

    question.questionReplies.push(newAnswer);

    await course?.save();

    if (req.user._id === question.user._id) {
      // create a notification
    }
    else {

      // sent an email to the particular user who asked the question
      const data = {
        name: question.user.name,
        title: courseContent.title,
      }

      // const html = await ejs.renderFile(path.join(__dirname, "../mails/question-reply.ejs"), data);

      try {

        await sendMail({
          email: question.user.email,
          subject: "Question Reply",
          template: "question-reply.ejs",
          data
        })

      }
      catch (err: any) {
        return next(new ErrorHandler(err.message, 500));
      }
    }

    res.status(200).json({
      success: true,
      course
    })

  }
  catch (err: any) {
    return next(new ErrorHandler(err.message, 500));
  }
})

