'use strict';

const fromNodeProviderChain = require('./utils/from-node-provider-chain');

const getCredentialProvider = ({ profile, region } = {}) => {
  if (process.env.AWS_DEFAULT_PROFILE && !process.env.AWS_PROFILE) {
    // We want to make sure that `AWS_DEFAULT_PROFILE` env var is recognized as a fallback to `AWS_PROFILE` as there are
    // inconsistencies across different tools but both AWS CLI and CDK recognize `AWS_DEFAULT_PROFILE` correctly
    // Mapping such as below allows us to avoid reimplementing good chunk of the credentials resolution logic from SDK JS v3
    process.env.AWS_PROFILE = process.env.AWS_DEFAULT_PROFILE;
  }

  return fromNodeProviderChain({
    profile,
    // Config below applies only to STS client configuration
    clientConfig: { region },
  });
};

module.exports = getCredentialProvider;
