import os
import requests
import sys

API = os.getenv('API_BASE', 'https://podcast-api-524304361363.us-west1.run.app')
email = os.getenv('TEST_USER_EMAIL', 'test@scottgerhardt.com')
password = os.getenv('TEST_USER_PASSWORD', 'Test1234')
terms_version = os.getenv('TERMS_VERSION', '2025-09-19')

payload = {
    'email': email,
    'password': password,
    'accept_terms': True,
    'terms_version': terms_version,
}

try:
    r = requests.post(f'{API}/api/auth/register', json=payload, timeout=30)
    print('status', r.status_code)
    try:
        print(r.json())
    except Exception:
        print(r.text)
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
