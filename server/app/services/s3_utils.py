import boto3
import os
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')

s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

def upload_file_to_s3(file_path, s3_key):
    try:
        s3_client.upload_file(
            file_path,
            S3_BUCKET_NAME,
            s3_key,
            ExtraArgs={
                'ContentType': 'application/pdf',
                'ContentDisposition': 'inline'
            }
        )
        return True
    except ClientError as e:
        print(f"S3 upload error: {e}")
        return False

def get_s3_file_url(s3_key):
    return f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

def generate_presigned_url(s3_key, expiration=3600):
    try:
        print(f"Generating presigned URL for S3 key: {s3_key}")
        print(f"Using bucket: {S3_BUCKET_NAME}")
        print(f"Using region: {AWS_REGION}")
        print(f"AWS credentials available: {bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)}")
        
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': S3_BUCKET_NAME,
                'Key': s3_key,
                'ResponseContentDisposition': 'inline'
            },
            ExpiresIn=expiration
        )
        print(f"Generated presigned URL: {url}")
        return url
    except ClientError as e:
        print(f"Presigned URL error: {e}")
        print(f"Error code: {e.response['Error']['Code']}")
        print(f"Error message: {e.response['Error']['Message']}")
        return None
    except Exception as e:
        print(f"Unexpected error generating presigned URL: {e}")
        return None