import os, datetime
from google.cloud import storage

_client = storage.Client()

def upload_bytes(bucket: str, key: str, data: bytes, content_type: str) -> str:
    b = _client.bucket(bucket)
    blob = b.blob(key)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{bucket}/{key}"

def make_signed_url(bucket: str, key: str, minutes: int = 60) -> str:
    b = _client.bucket(bucket)
    blob = b.blob(key)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=minutes),
        method="GET",
    )
