'use strict';

const getCredentialProvider = require('./get-credential-provider');
const ensureAwsSpecificEnvironmentVariables = require('./ensure-aws-specific-environment-variables');
const getRegion = require('./get-region');

module.exports = {
  getCredentialProvider,
  getRegion,
  ensureAwsSpecificEnvironmentVariables,
};
