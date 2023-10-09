/* 
  we have to send errors res.status(err_code).json(err) many times in our application in many diff cases, 
  so we are using OOP to handle those objects

  super() method is used to call the constructor of the parent class (Error in this case). it passes the message argument to the Error class constructor, which sets the Error message for the instance.
*/

class ErrorHandler extends Error { // Error is just an another name of class
  statusCode: Number;

  constructor(message:any, statusCode:Number){
    super(message);
    this.statusCode = statusCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ErrorHandler;