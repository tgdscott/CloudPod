import os, json
try:
    from google.cloud import tasks_v2
    from google.protobuf import timestamp_pb2
except ImportError:
    tasks_v2 = None
from datetime import datetime

def enqueue_http_task(path: str, body: dict) -> dict:
    if tasks_v2 is None:
        raise ImportError("google-cloud-tasks is not installed")
    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(os.getenv("GOOGLE_CLOUD_PROJECT"), os.getenv("TASKS_LOCATION"), os.getenv("TASKS_QUEUE"))
    url = f"{os.getenv('TASKS_URL_BASE')}{path}"
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": url,
            "headers": {"Content-Type": "application/json", "X-Tasks-Auth": os.getenv("TASKS_AUTH")},
            "body": json.dumps(body).encode(),
        }
    }
    created = client.create_task(request={"parent": parent, "task": task})
    return {"name": created.name}
