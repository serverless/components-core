'use strict';

const fromNodeProviderChain = require('./utils/from-node-provider-chain');

const getCredentialProvider = ({ profile, region } = {}) => {
  return fromNodeProviderChain({
    profile,
    // Config below applies only to STS client configuration
    clientConfig: { region },
  });
};

module.exports = getCredentialProvider;
