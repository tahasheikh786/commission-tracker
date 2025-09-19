#!/usr/bin/env python3
"""
S3 Credentials Checker

This script helps you verify and test your S3 credentials.
"""

import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

def check_s3_credentials():
    """Check S3 credentials and connection."""
    load_dotenv()
    
    print("🔍 Checking S3 Credentials...")
    print("=" * 50)
    
    # Get credentials from environment
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('AWS_REGION', 'us-east-1')
    bucket_name = os.environ.get('S3_BUCKET_NAME')
    
    print(f"AWS_ACCESS_KEY_ID: {access_key[:10] + '...' if access_key else 'NOT SET'}")
    print(f"AWS_SECRET_ACCESS_KEY: {'SET' if secret_key else 'NOT SET'}")
    print(f"AWS_REGION: {region}")
    print(f"S3_BUCKET_NAME: {bucket_name}")
    print()
    
    if not all([access_key, secret_key, bucket_name]):
        print("❌ Missing required credentials!")
        return False
    
    # Check if credentials look complete
    if len(access_key) < 16:
        print("⚠️  AWS_ACCESS_KEY_ID seems too short (should be ~20 characters)")
    if len(secret_key) < 20:
        print("⚠️  AWS_SECRET_ACCESS_KEY seems too short (should be ~40 characters)")
    
    try:
        # Test S3 connection
        print("🔗 Testing S3 connection...")
        s3_client = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
        
        # Try to list buckets
        response = s3_client.list_buckets()
        print("✅ S3 connection successful!")
        print(f"Available buckets: {[bucket['Name'] for bucket in response['Buckets']]}")
        
        # Try to access the specific bucket
        if bucket_name:
            print(f"\n🔍 Checking bucket '{bucket_name}'...")
            try:
                response = s3_client.list_objects_v2(Bucket=bucket_name, MaxKeys=5)
                if 'Contents' in response:
                    print(f"✅ Found {len(response['Contents'])} files (showing first 5):")
                    for obj in response['Contents']:
                        print(f"  - {obj['Key']} ({obj['Size']} bytes, {obj['LastModified']})")
                else:
                    print("📁 Bucket is empty")
                
                # Get bucket info
                bucket_info = s3_client.head_bucket(Bucket=bucket_name)
                print(f"✅ Bucket '{bucket_name}' is accessible")
                
            except ClientError as e:
                error_code = e.response['Error']['Code']
                if error_code == 'NoSuchBucket':
                    print(f"❌ Bucket '{bucket_name}' does not exist")
                elif error_code == 'AccessDenied':
                    print(f"❌ Access denied to bucket '{bucket_name}'")
                else:
                    print(f"❌ Error accessing bucket: {e}")
                return False
        
        return True
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'InvalidAccessKeyId':
            print("❌ Invalid AWS Access Key ID")
        elif error_code == 'SignatureDoesNotMatch':
            print("❌ Invalid AWS Secret Access Key")
        else:
            print(f"❌ S3 connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def main():
    success = check_s3_credentials()
    
    if not success:
        print("\n" + "=" * 50)
        print("🔧 TROUBLESHOOTING TIPS:")
        print("=" * 50)
        print("1. Check your .env file for complete AWS credentials")
        print("2. AWS Access Key ID should be ~20 characters long")
        print("3. AWS Secret Access Key should be ~40 characters long")
        print("4. Make sure the credentials have S3 access permissions")
        print("5. Verify the bucket name is correct")
        print("\nExample .env format:")
        print("AWS_ACCESS_KEY_ID=AKIA...")
        print("AWS_SECRET_ACCESS_KEY=...")
        print("AWS_REGION=us-east-1")
        print("S3_BUCKET_NAME=your-bucket-name")

if __name__ == "__main__":
    main()
