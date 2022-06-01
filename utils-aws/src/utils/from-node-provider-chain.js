'use strict';

// Below code is heavily based on https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-providers/src/fromNodeProviderChain.ts
// With only minor changes and adjustments
// License of the original code: https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-providers/LICENSE

const {
  getDefaultRoleAssumer,
  getDefaultRoleAssumerWithWebIdentity,
} = require('@aws-sdk/client-sts');

const defaultProvider = require('./default-provider');

/**
 * This is the same credential provider as {@link defaultProvider|the default provider for Node.js SDK},
 * but with default role assumers so you don't need to import them from
 * STS client and supply them manually.
 *
 * You normally don't need to use this explicitly in the client constructor.
 * It is useful for utility functions requiring credentials like S3 presigner,
 * or RDS signer.
 *
 * ```js
 * import { fromNodeProviderChain } from "@aws-sdk/credential-providers"; // ES6 import
 * // const { fromNodeProviderChain } = require("@aws-sdk/credential-providers") // CommonJS import
 *
 * const credentialProvider = fromNodeProviderChain({
 *   //...any input of fromEnv(), fromSSO(), fromTokenFile(), fromIni(),
 *   // fromProcess(), fromInstanceMetadata(), fromContainerMetadata()
 *
 *   // Optional. Custom STS client configurations overriding the default ones.
 *   clientConfig: { region },
 * })
 * ```
 */
function fromNodeProviderChain(init) {
  // We needed to swap the `defaultProvider` implementation for the one that was adjusted by us in `./default-provider`
  return defaultProvider({
    ...init,
    roleAssumer: init.roleAssumer || getDefaultRoleAssumer(init.clientConfig),
    roleAssumerWithWebIdentity:
      init.roleAssumerWithWebIdentity || getDefaultRoleAssumerWithWebIdentity(init.clientConfig),
  });
}

module.exports = fromNodeProviderChain;
