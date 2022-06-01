'use strict';

// Below code is heavily based on https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-provider-node/src/remoteProvider.ts
// With only minor changes and adjustments
// License of the original code: https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-provider-node/LICENSE

const { CredentialsProviderError } = require('@aws-sdk/property-provider');

const {
  ENV_CMDS_FULL_URI,
  ENV_CMDS_RELATIVE_URI,
  fromContainerMetadata,
  fromInstanceMetadata,
} = require('@aws-sdk/credential-provider-imds');

const ENV_IMDS_DISABLED = 'AWS_EC2_METADATA_DISABLED';

// We needed to copy it as-is as it is internal logic of `@aws-sdk/credential-provider-node` package
function remoteProvider(init) {
  if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
    return fromContainerMetadata(init);
  }

  if (process.env[ENV_IMDS_DISABLED]) {
    return async () => {
      throw new CredentialsProviderError('EC2 Instance Metadata Service access disabled');
    };
  }

  return fromInstanceMetadata(init);
}

module.exports = remoteProvider;
