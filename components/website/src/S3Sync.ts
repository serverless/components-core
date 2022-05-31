import * as fs from 'fs-extra';
import * as path from 'path';
import { lookup } from 'mime-types';
import { chunk, flatten } from 'lodash';
import {
  DeleteObjectsCommand,
  S3Client,
  _Object,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { ComponentContext, ServerlessError } from '@serverless-components/core';
import computeS3ETag from './s3-etag';

type S3Objects = Record<string, _Object>;

export default class S3Sync {
  private s3Client: S3Client;

  constructor(sdkConfig: S3ClientConfig, private context: ComponentContext) {
    this.s3Client = new S3Client(sdkConfig);
  }

  /**
   * Synchronize a local folder to a S3 bucket.
   * @return Number of files changed.
   */
  async s3Sync({
    localPath,
    targetPathPrefix,
    bucketName,
  }: {
    localPath: string;
    targetPathPrefix?: string;
    bucketName: string;
  }): Promise<number> {
    let filesUploaded = 0;
    let filesSkipped = 0;

    const filesToUpload: string[] = await this.listFilesRecursively(localPath);
    const existingS3Objects = await this.s3ListAll(bucketName, targetPathPrefix);

    const uploadFile = async (file) => {
      const targetKey =
        targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file;
      const fileContent = fs.readFileSync(path.posix.join(localPath, file));

      // Check that the file isn't already uploaded
      if (targetKey in existingS3Objects) {
        const existingObject = existingS3Objects[targetKey];
        const etag = computeS3ETag(fileContent);
        if (etag === existingObject.ETag) {
          filesSkipped++;
          return;
        }
      }

      this.context.logVerbose(`Uploading ${file}`);
      await this.s3Put(bucketName, targetKey, fileContent);
      filesUploaded++;
    };

    // Upload files by chunks
    for (const batch of chunk(filesToUpload, 2)) {
      await Promise.all(batch.map(uploadFile));
    }
    if (filesSkipped > 0) {
      this.context.logVerbose(`Skipped uploading ${filesSkipped} unchanged files`);
    }

    const targetKeys = filesToUpload.map((file) => {
      return targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file;
    });
    const keysToDelete = this.findKeysToDelete(Object.keys(existingS3Objects), targetKeys);
    if (keysToDelete.length > 0) {
      keysToDelete.forEach((key) => {
        this.context.logVerbose(`Deleting ${key}`);
        filesUploaded++;
      });
      await this.s3Delete(bucketName, keysToDelete);
    }

    return filesUploaded;
  }

  async emptyBucket(bucketName: string) {
    const existingObjects = await this.s3ListAll(bucketName);
    await this.s3Delete(bucketName, Object.keys(existingObjects));
  }

  private async listFilesRecursively(directory: string): Promise<string[]> {
    const items = await fs.readdir(directory);

    const files = await Promise.all(
      items.map(async (fileName) => {
        const fullPath = path.posix.join(directory, fileName);
        const fileStat = await fs.stat(fullPath);
        if (fileStat.isFile()) {
          return [fileName];
        } else if (fileStat.isDirectory()) {
          const subFiles = await this.listFilesRecursively(fullPath);

          return subFiles.map((subFileName) => path.posix.join(fileName, subFileName));
        }

        return [];
      })
    );

    return flatten(files);
  }

  private async s3ListAll(bucketName: string, pathPrefix?: string): Promise<S3Objects> {
    let result;
    let continuationToken;
    const objects: S3Objects = {};
    do {
      result = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: pathPrefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        })
      );
      (result.Contents ?? []).forEach((object) => {
        if (object.Key === undefined) {
          return;
        }
        objects[object.Key] = object;
      });
      continuationToken = result.NextContinuationToken;
    } while (result.IsTruncated === true);

    return objects;
  }

  private findKeysToDelete(existing: string[], target: string[]): string[] {
    // Returns every key that shouldn't exist anymore
    return existing.filter((key) => target.indexOf(key) === -1);
  }

  private async s3Put(bucket: string, key: string, fileContent: Buffer): Promise<void> {
    let contentType = lookup(key);
    if (contentType === false) {
      contentType = 'application/octet-stream';
    }
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      })
    );
  }

  private async s3Delete(bucket: string, keys: string[]): Promise<void> {
    const response = await this.s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((key) => {
            return {
              Key: key,
            };
          }),
        },
      })
    );

    // S3 deleteObjects operation will fail silently
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
    if (response.Errors !== undefined && response.Errors.length !== 0) {
      response.Errors.forEach((error) =>
        this.context.logVerbose(`S3 error: ${error.Key} ${error.Message}`)
      );
      throw new ServerlessError(
        'Unable to delete some files in S3. The "s3:DeleteObject" IAM permissions is required to synchronize files to S3, is it missing from your IAM permissions?',
        'S3_DELETE_OBJECTS_FAILURE'
      );
    }
  }
}
