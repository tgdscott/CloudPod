import requests
import sys

API='https://podcast-api-524304361363.us-west1.run.app'
email='test@scottgerhardt.com'
password='Test1234'

try:
    r = requests.post(f'{API}/api/auth/register', json={'email': email, 'password': password})
    print('status', r.status_code)
    try:
        print(r.json())
    except Exception:
        print(r.text)
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
