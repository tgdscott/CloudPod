import json
import os
import sys
import urllib.request

url = os.getenv('API_BASE', 'https://podcast-api-524304361363.us-west1.run.app') + '/api/auth/register'
terms_version = os.getenv('TERMS_VERSION', '2025-09-19')

data = {
    'email': os.getenv('TEST_USER_EMAIL', 'test@scottgerhardt.com'),
    'password': os.getenv('TEST_USER_PASSWORD', 'Test1234'),
    'accept_terms': True,
    'terms_version': terms_version,
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode('utf-8')
        print('STATUS', resp.status)
        print(body)
except urllib.error.HTTPError as e:
    print('HTTPERR', e.code)
    try:
        print(e.read().decode())
    except Exception:
        pass
    sys.exit(1)
except Exception as e:
    print('ERR', e)
    sys.exit(2)
