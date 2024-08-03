import type { ValidatedEventAPIGatewayProxyEvent } from '@libs/api-gateway';
import { formatJSONResponse } from '@libs/api-gateway';
import { middyfy } from '@libs/lambda';
import axios from 'axios';
import { PassThrough, Readable } from 'stream';
import { Upload } from 's3-stream-upload';
import ffmpeg from 'fluent-ffmpeg';
import { S3Client } from '@aws-sdk/client-s3';

import schema from './schema';

const hello: ValidatedEventAPIGatewayProxyEvent<typeof schema> = async (event) => {
  const response = await axios({
    url: event.body.url,
    responseType: 'arraybuffer',
    headers: { Range: 'bytes=0-1000000' },
  });

  const s3Client = new S3Client({
    region: 'AWS_BUCKET_REGION',
    credentials: {
      accessKeyId: 'AWS_ACCESS_KEY_APP',
      secretAccessKey: 'AWS_SECRET_ACCESS_KEY_APP',
    },
  });

  const buffer = Buffer.from(response.data, 'binary');
  const readableStream = Readable.from(buffer);

  const passThroughStream = new PassThrough();
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: 'AWS_BUCKET_NAME',
      Key: 'key',
      Body: passThroughStream,
      ContentType: 'image/png',
    },
  });

  ffmpeg(readableStream)
    .inputFormat('mp4')
    .outputOptions('-ss', '00:00:01', '-vframes', '1')
    .outputFormat('image2')
    .on('error', (err) => {
      console.error('Error during thumbnail generation:', err);
      passThroughStream.destroy(err); // Close the stream and propagate the error
    })
    .pipe(passThroughStream, { end: true });

  await upload.done();
  console.log('Thumbnail uploaded successfully');

  return formatJSONResponse({
    message: `Hello ${event.body.name}, welcome to the exciting Serverless world!`,
    event,
  });
};

export const main = middyfy(hello);
