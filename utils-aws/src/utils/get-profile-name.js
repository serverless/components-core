'use strict';

function getProfileName() {
  return process.env.AWS_PROFILE || process.env.AWS_DEFAULT_PROFILE || 'default';
}

module.exports = getProfileName;
