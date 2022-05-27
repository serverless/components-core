'use strict';

const getCredentialProvider = require('./get-credential-provider');
const ensureAwsSpecificEnvironmentVariables = require('./ensure-aws-specific-environment-variables');

module.exports = {
  getCredentialProvider,
  ensureAwsSpecificEnvironmentVariables,
};
