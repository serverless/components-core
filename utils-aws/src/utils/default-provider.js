'use strict';

// Below code is heavily based on https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-provider-node/src/defaultProvider.ts
// With only minor changes and adjustments
// License of the original code: https://github.com/aws/aws-sdk-js-v3/blob/95eb04e51699e408d645fbc290bc0f24d0639a6b/packages/credential-provider-node/LICENSE

const { fromEnv } = require('@aws-sdk/credential-provider-env');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const { fromProcess } = require('@aws-sdk/credential-provider-process');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');
const { fromTokenFile } = require('@aws-sdk/credential-provider-web-identity');
const { chain, CredentialsProviderError, memoize } = require('@aws-sdk/property-provider');

const remoteProvider = require('./remote-provider');

/**
 * Creates a credential provider that will attempt to find credentials from the
 * following sources (listed in order of precedence):
 *   * Environment variables exposed via `process.env`
 *   * SSO credentials from token cache
 *   * Web identity token credentials
 *   * Shared credentials and config ini files
 *   * The EC2/ECS Instance Metadata Service
 *
 * The default credential provider will invoke one provider at a time and only
 * continue to the next if no credentials have been located. For example, if
 * the process finds values defined via the `AWS_ACCESS_KEY_ID` and
 * `AWS_SECRET_ACCESS_KEY` environment variables, the files at
 * `~/.aws/credentials` and `~/.aws/config` will not be read, nor will any
 * messages be sent to the Instance Metadata Service.
 *
 * @param init                  Configuration that is passed to each individual
 *                              provider
 *
 * @see {@link fromEnv}                 The function used to source credentials from
 *                              environment variables
 * @see {@link fromSSO}                 The function used to source credentials from
 *                              resolved SSO token cache
 * @see {@link fromTokenFile}           The function used to source credentials from
 *                              token file
 * @see {@link fromIni}                The function used to source credentials from INI
 *                              files
 * @see {@link fromProcess}             The function used to sources credentials from
 *                              credential_process in INI files
 * @see {@link fromInstanceMetadata}    The function used to source credentials from the
 *                              EC2 Instance Metadata Service
 * @see {@link fromContainerMetadata}   The function used to source credentials from the
 *                              ECS Container Metadata Service
 */
function defaultProvider(init) {
  return memoize(
    chain(
      // Change the logic to not skip `fromEnv` when process.env.AWS_PROFILE is present
      // The change was introduced in order to follow the same resolution logic as SDK v2, AWS CLI and AWS CDK
      // Previous line:
      // ...(init.profile || process.env[ENV_PROFILE] ? [] : [fromEnv()]),
      ...(init.profile ? [] : [fromEnv()]),
      fromSSO(init),
      fromIni(init),
      fromProcess(init),
      fromTokenFile(init),
      remoteProvider(init),
      async () => {
        throw new CredentialsProviderError('Could not load credentials from any providers', false);
      }
    ),
    (credentials) =>
      credentials.expiration !== undefined &&
      credentials.expiration.getTime() - Date.now() < 300000,
    (credentials) => credentials.expiration !== undefined
  );
}

module.exports = defaultProvider;
