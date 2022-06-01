# getRegion

Utility that resolves AWS region, following the AWS SDK JS v3 region resolution chain with minor adjustment to match the behavior of the AWS CLI and AWS CDK.

Example usage:

```javascript
const { S3Client } = require('@aws-sdk/client-s3');
const { getRegion } = require('@serverless-components/utils-aws');

const region = await getRegion({ profile: 'my-profile' });
const client = new S3Client({ region });
```

Supports the following options:

- `profile` - override profile that will be used during region resolution

### Differences from default AWS SDK JS v3 region resolution

It follows the same region resolution procedure as AWS SDK JS v3, with a few exceptions:

1. If region is not found in any of the sources, it is set to `us-east-1` by default.

The changes above were introduced in order to be compatible with behavior of AWS CDK and AWS CLI.
