import { stub } from 'sinon';
import { readFileSync } from 'fs';
import path from 'path';
import { FakeCdk, FakeComponentContext } from '@serverless-components/core-aws';
import { expect } from 'chai';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import Website from '../../src/Website';
import computeS3ETag from '../../src/s3-etag';

const s3Mock = mockClient(S3Client);
const cloudFrontMock = mockClient(CloudFrontClient);

describe('Website', () => {
  beforeEach(() => {
    s3Mock.reset();
    cloudFrontMock.reset();
  });

  it('should create required AWS resources', async () => {
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'));
    s3Mock.on(ListObjectsV2Command).resolves({});
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
    });
    stub(component, 'getCdk').resolves(fakeCdk);

    await component.deploy();

    const template = await fakeCdk.getGeneratedTemplate('id');
    expect(template).to.deep.equal(
      JSON.parse(readFileSync(path.join(__dirname, 'expected/default.json')).toString())
    );
  });

  it('should support a custom domain', async () => {
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'));
    s3Mock.on(ListObjectsV2Command).resolves({});
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
      domain: 'example.com',
      certificate:
        'arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123',
    });
    stub(component, 'getCdk').resolves(fakeCdk);

    await component.deploy();

    const template = await fakeCdk.getGeneratedTemplate('id');
    expect(template).to.deep.equal(
      JSON.parse(readFileSync(path.join(__dirname, 'expected/custom-domain.json')).toString())
    );
  });

  it('should support multiple custom domains', async () => {
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'));
    s3Mock.on(ListObjectsV2Command).resolves({});
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
      domain: ['example.com', 'www.example.com'],
      certificate:
        'arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123',
    });
    stub(component, 'getCdk').resolves(fakeCdk);

    await component.deploy();

    const template = await fakeCdk.getGeneratedTemplate('id');

    // Check that CloudFront uses all the custom domains
    expect(template.Resources.CDN2330F4C0.Properties.DistributionConfig.Aliases).to.deep.equal([
      'example.com',
      'www.example.com',
    ]);
    // This should contain the first domain of the list
    expect(template.Outputs.url.Value).to.equal('https://example.com');
    expect(template.Outputs.domain.Value).to.equal('example.com');
    expect(template.Outputs.cname.Value).to.deep.equal({
      'Fn::GetAtt': ['CDN2330F4C0', 'DomainName'],
    });
  });

  it('should allow to customize security HTTP headers', async () => {
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'));
    s3Mock.on(ListObjectsV2Command).resolves({});
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
      domain: ['example.com', 'www.example.com'],
      certificate:
        'arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123',
      security: {
        allowIframe: true,
      },
    });
    stub(component, 'getCdk').resolves(fakeCdk);

    await component.deploy();

    const template = await fakeCdk.getGeneratedTemplate('id');

    // Check that the `x-frame-options` header is no longer set
    expect(template.Resources.ResponseFunctionB78A69CA.Properties.FunctionCode).to
      .equal(`function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, {
    "x-content-type-options": {
        "value": "nosniff"
    },
    "x-xss-protection": {
        "value": "1; mode=block"
    },
    "strict-transport-security": {
        "value": "max-age=63072000"
    }
}, response.headers);
    return response;
}`);
  });

  it('should allow to redirect to the main domain', async () => {
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'));
    s3Mock.on(ListObjectsV2Command).resolves({});
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
      domain: ['example.com', 'www.example.com'],
      certificate:
        'arn:aws:acm:us-east-1:123456615250:certificate/0a28e63d-d3a9-4578-9f8b-14347bfe8123',
      redirectToMainDomain: true,
    });
    stub(component, 'getCdk').resolves(fakeCdk);

    await component.deploy();

    const template = await fakeCdk.getGeneratedTemplate('id');

    expect(template.Resources.RequestFunction0B9B463A.Properties.FunctionCode).to
      .equal(`var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml)$)([^.]+$)/;

function handler(event) {
    var uri = event.request.uri;
    var request = event.request;
    var isUriToRedirect = REDIRECT_REGEX.test(uri);

    if (isUriToRedirect) {
        request.uri = "/index.html";
    }
    if (request.headers["host"].value !== "example.com") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://example.com" + request.uri
                }
            }
        };
    }

    return event.request;
}`);
  });

  it('should synchronize files to S3', async () => {
    const component = new Website('id', new FakeComponentContext(), {
      path: path.join(__dirname, 'fixture'),
    });
    const cfOutputs = {
      bucketName: 'bucket-name',
      distributionId: '123456',
    };
    const fakeCdk = new FakeCdk(path.join(__dirname, 'cdk.out'), cfOutputs);
    stub(component, 'getCdk').resolves(fakeCdk);

    // sinon.stub(CloudFormationHelpers, 'getStackOutput').resolves('bucket-name');

    /*
     * This scenario simulates the following:
     * - index.html is up-to-date, it should be ignored
     * - styles.css has changes, it should be updated to S3
     * - scripts.js is new, it should be created in S3
     * - image.jpg doesn't exist on disk, it should be removed from S3
     */
    s3Mock.on(ListObjectsV2Command).resolves({
      IsTruncated: false,
      Contents: [
        {
          Key: 'index.html',
          ETag: computeS3ETag(readFileSync(path.join(__dirname, 'fixture/index.html'))),
        },
        { Key: 'styles.css' },
        { Key: 'image.jpg' },
      ],
    });
    // const putObjectSpy = s3Mock.on(PutObjectCommand);
    s3Mock.on(DeleteObjectsCommand).resolves({
      Deleted: [{ Key: 'image.jpg' }],
    });
    // const cloudfrontInvalidationSpy = awsMock.mockService('CloudFront', 'createInvalidation');

    await component.deploy();

    // scripts.js and styles.css were updated
    expect(s3Mock.commandCalls(PutObjectCommand)).to.have.length(2);
    // sinon.assert.callCount(putObjectSpy, 2);
    expect(s3Mock.commandCalls(PutObjectCommand)[0].firstArg.input).to.deep.equal({
      Bucket: 'bucket-name',
      Key: 'scripts.js',
      Body: readFileSync(path.join(__dirname, 'fixture/scripts.js')),
      ContentType: 'application/javascript',
    });
    expect(s3Mock.commandCalls(PutObjectCommand)[1].firstArg.input).to.deep.equal({
      Bucket: 'bucket-name',
      Key: 'styles.css',
      Body: readFileSync(path.join(__dirname, 'fixture/styles.css')),
      ContentType: 'text/css',
    });
    // image.jpg was deleted
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).to.have.length(1);
    // sinon.assert.calledOnce(deleteObjectsSpy);
    expect(s3Mock.commandCalls(DeleteObjectsCommand)[0].firstArg.input).to.deep.equal({
      Bucket: 'bucket-name',
      Delete: {
        Objects: [{ Key: 'image.jpg' }],
      },
    });
    // A CloudFront invalidation was triggered
    expect(cloudFrontMock.commandCalls(CreateInvalidationCommand)).to.have.length(1);
  });
});
