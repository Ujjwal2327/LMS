import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

export interface IComment extends Document {
  user: IUser;
  question: string;
  questionReplies: IComment[];
}

interface IReview extends Document {
  user: object;
  rating: number;
  comment: string;
  commentReplies: IComment[];   // can only be replied by admin
  // commentReplies: Array<IComment>;
}

interface ILink extends Document {
  title: string;
  url: string;
}

interface ICourseData extends Document {    // talking about 1 video here
  title: string;
  description: string;
  videoUrl: string;
  videoThumbnail: object;
  videoSection: string;
  videoLength: number;
  videoPlayer: string;
  links: ILink[];
  suggestion: string;
  questions: IComment[];
}

interface ICourse extends Document {
  name: string;
  description: string;
  price: number;
  estimatedPrice: number;
  thumbnail: object;
  tags: string;
  level: string;
  demoUrl: string;
  benifits: { title: string }[];    // [{t:s},...]
  prerequisites: { title: string }[];
  reviews: IReview[];
  courseData: ICourseData[];
  ratings?: number;
  purchased?: number;
}


const reviewSchema = new Schema<IReview>({
  user: Object,
  rating: {
    type: Number,
    default: 0,
  },
  comment: String
})

const LinkSchema = new Schema<ILink>({
  title: String,
  url: String
})

const commentSchema = new Schema<IComment>({
  user: Object,
  question: String,
  questionReplies: [Object]
})

const courseDataSchema = new Schema<ICourseData>({
  title: String,
  description: String,
  videoUrl: String,
  videoThumbnail: Object,
  videoSection: String,
  videoLength: Number,
  videoPlayer: String,
  links: [LinkSchema],
  suggestion: String,
  questions: [commentSchema]
})

const courseSchema = new Schema<ICourse>({
  name: {
    type: String,
    required: [true, "Please enter course name"],
  },
  description: {
    type: String,
    required: [true, "Please enter course description"],
  },
  price: {
    type: Number,
    required: [true, "Please enter course price"],
  },
  estimatedPrice: Number,
  thumbnail:{
    public_id: {
      type: String,
      // required: [true, "Please enter course thumbnail public_id"],
    },
    url: {
      type: String,
      // required: [true, "Please enter course thumbnail url"],
    }
  },
  tags: {
    type: String,
    required: [true, "Please enter course tags"],
  },
  level: {
    type: String,
    required: [true, "Please enter course level"],
  },
  demoUrl: {
    type: String,
    required: [true, "Please enter course demoUrl"],
  },
  benifits: [{ title: String }],
  prerequisites: [{ title: String }],
  reviews: [reviewSchema],
  courseData: [courseDataSchema],
  ratings: {
    type: Number,
    default: 0,
  },
  purchased: {
    type: Number,
    default: 0,
  }
})

const courseModel: Model<ICourse> = mongoose.model("Course", courseSchema);
export default courseModel;