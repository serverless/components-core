'use strict';

const fromNodeProviderChain = require('./utils/from-node-provider-chain');
const ensureAwsSpecificEnvironmentVariables = require('./ensure-aws-specific-environment-variables');

const getCredentialProvider = ({ profile, region } = {}) => {
  ensureAwsSpecificEnvironmentVariables();

  return fromNodeProviderChain({
    profile,
    // Config below applies only to STS client configuration
    clientConfig: { region },
  });
};

module.exports = getCredentialProvider;
