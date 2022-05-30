'use strict';

const { loadSharedConfigFiles } = require('@aws-sdk/shared-ini-file-loader');

const getProfileName = require('./utils/get-profile-name');

// We are resolving region up-front for three reasons:
// 1. To recognize both `AWS_REGION` and `AWS_DEFAULT_REGION`
// 2. To recognize both `AWS_PROFILE` and `AWS_DEFAULT_PROFILE` during profile resolution that can influence resolved region
// 3. To provide a default of `us-east-1`, in the same way as AWS CDK and AWS CLI does.
async function getRegion({ profile } = {}) {
  const regionFromEnv = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

  if (regionFromEnv) {
    return regionFromEnv;
  }

  const regionFromSharedFiles = await getRegionFromCredentialsAndConfig({ profile });
  if (regionFromSharedFiles) {
    return regionFromSharedFiles;
  }

  // TODO: CHECK FROM EC2 Metadata service

  // Return the default if region could not be found in other sources
  return 'us-east-1';
}

const getRegionFromCredentialsAndConfig = async ({ profile } = {}) => {
  const resolvedProfile = profile || getProfileName();
  const { configFile, credentialsFile } = await loadSharedConfigFiles();

  const profileFromCredentials = credentialsFile[resolvedProfile] || {};
  const profileFromConfig = configFile[resolvedProfile] || {};

  const mergedProfile = { ...profileFromCredentials, ...profileFromConfig };

  return mergedProfile.region;
};

module.exports = getRegion;
