// Central error handler. Controllers throw AppError (or let DB errors bubble)
// and this turns them into a consistent JSON response.

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A company with this email already exists' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Something went wrong' : err.message;
  res.status(statusCode).json({ message });
}

module.exports = { errorHandler, AppError };
