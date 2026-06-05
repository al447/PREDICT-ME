const isProduction = process.env.NODE_ENV === 'production';

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Server Error';

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  // In production: mask internal 5xx messages to avoid leaking implementation details
  if (isProduction && statusCode >= 500) {
    console.error('[Error]', err);
    message = 'An unexpected error occurred. Please try again later.';
  }

  res.status(statusCode).json({ success: false, error: message });
};

module.exports = errorHandler;
