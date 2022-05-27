'use strict';

function ensureAwsSpecificEnvironmentVariables() {
  if (process.env.AWS_DEFAULT_PROFILE && !process.env.AWS_PROFILE) {
    // We want to make sure that `AWS_DEFAULT_PROFILE` env var is recognized as a fallback to `AWS_PROFILE` as there are
    // inconsistencies across different tools but both AWS CLI and CDK recognize `AWS_DEFAULT_PROFILE` correctly
    // Mapping such as below allows us to avoid reimplementing good chunk of the credentials resolution logic
    // and region resolution logic (as it can be impacted by profile) from SDK v3
    process.env.AWS_PROFILE = process.env.AWS_DEFAULT_PROFILE;
  }

  if (process.env.AWS_DEFAULT_REGION && !process.env.AWS_REGION) {
    // We want to make sure that `AWS_DEFAULT_REGION` env var is recognized as a fallback to `AWS_REGION` as there are
    // inconsistencies across different tools but both AWS CLI and CDK recognize `AWS_DEFAULT_REGION` correctly
    // Mapping such as below allows us to avoid implementing region resolution logic on our own
    process.env.AWS_REGION = process.env.AWS_DEFAULT_REGION;
  }
}

module.exports = ensureAwsSpecificEnvironmentVariables;
