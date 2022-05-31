'use strict';

class ServerlessError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

module.exports = {
  ServerlessError,
};
