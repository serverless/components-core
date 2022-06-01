# getCredentialProvider

Utility that resolves credential provider for use with AWS SDK JS v3. The credentials are resolved with the same behavior as the AWS CLI and AWS CDK.

Example usage:

```javascript
const { S3Client } = require('@aws-sdk/client-s3');
const { getCredentialProvider } = require('@serverless-components/utils-aws');

const provider = getCredentialProvider({ region: 'us-east-1', profile: 'my-profile' });
const client = new S3Client({ credentials: provider });
```

Supports the following options:

- `region` - will be applied to STS client that is used during credential resolution
- `profile` - override profile that will be used during credential resolution

### Differences from default AWS SDK JS v3 credential resolution chain

It follows the same credential resolution chain as [AWS SDK JS v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_credential_providers.html#fromNodeProviderChain), with a few exceptions:

1. It recognizes `AWS_DEFAULT_PROFILE` in addition to `AWS_PROFILE` environment variable. The `AWS_PROFILE` env var takes precedence over `AWS_DEFAULT_PROFILE`.
2. Respects `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` over `AWS_PROFILE`, following the same behavior as AWS SDK JS v3, AWS CLI, and AWS CDK. The current AWS SDK JS v3 behavior has been reported as a [bug](https://github.com/aws/aws-sdk-js-v3/issues/2549).

The changes above were introduced in order to match the behavior of AWS CDK and AWS CLI.
